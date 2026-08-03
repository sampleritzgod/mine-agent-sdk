import { ToolInputError, ToolTimeoutError } from "../errors/sdk-error";
import { type EventBus } from "../events/event-bus";
import type { Metadata } from "../types/json";
import type { ToolCall } from "../types/model";
import type { z } from "zod";
import { errorMessage, serializeError } from "../utils/errors";
import { parseMaybeJsonObject } from "../utils/json";
import { sleep } from "../utils/sleep";
import { durationMs, nowIso } from "../utils/time";
import type {
  AnyTool,
  ToolDefinition,
  ToolExecutionLog,
  ToolExecutionResult,
  ToolExecutorRequest,
} from "./tool";

export interface ToolExecutorOptions {
  events?: EventBus;
}

export class ToolExecutor {
  private readonly events: EventBus | undefined;

  constructor(options: ToolExecutorOptions = {}) {
    this.events = options.events;
  }

  async execute(tool: AnyTool, request: ToolExecutorRequest): Promise<ToolExecutionResult> {
    const startedAt = nowIso();
    const logs: ToolExecutionLog[] = [];
    const maxAttempts = Math.max(1, Math.floor(tool.retry.attempts));
    let attempts = 0;
    let lastError: unknown;

    const parsedInput = this.parseInput(tool, request.toolCall);
    if (!parsedInput.success) {
      const endedAt = nowIso();
      const failure = {
        success: false,
        error: serializeError(parsedInput.error),
        timing: {
          startedAt,
          endedAt,
          durationMs: durationMs(startedAt, endedAt),
          attempts: 1,
        },
        logs,
      };
      this.events?.emit("tool.started", {
        runId: request.runId,
        toolCall: request.toolCall,
        attempt: 1,
      });
      this.events?.emit("tool.failed", {
        runId: request.runId,
        toolCall: request.toolCall,
        result: failure,
      });
      return failure;
    }

    while (attempts < maxAttempts) {
      attempts += 1;
      this.events?.emit("tool.started", {
        runId: request.runId,
        toolCall: request.toolCall,
        attempt: attempts,
      });

      try {
        const result = await this.executeOnce(
          tool,
          parsedInput.input,
          request.runId,
          request.toolCall,
          logs,
          request.metadata ?? {},
        );
        const finishedAt = nowIso();
        const executionResult: ToolExecutionResult = {
          success: true,
          result,
          timing: {
            startedAt,
            endedAt: finishedAt,
            durationMs: durationMs(startedAt, finishedAt),
            attempts,
          },
          logs,
        };
        this.events?.emit("tool.finished", {
          runId: request.runId,
          toolCall: request.toolCall,
          result: executionResult,
        });
        return executionResult;
      } catch (error) {
        lastError = error;
        logs.push({
          timestamp: nowIso(),
          message: errorMessage(error),
        });

        if (attempts < maxAttempts) {
          await sleep(this.retryDelay(tool.retry.backoffMs, attempts));
        }
      }
    }

    const endedAt = nowIso();
    const failure: ToolExecutionResult = {
      success: false,
      error: serializeError(lastError),
      timing: {
        startedAt,
        endedAt,
        durationMs: durationMs(startedAt, endedAt),
        attempts,
      },
      logs,
    };
    this.events?.emit("tool.failed", {
      runId: request.runId,
      toolCall: request.toolCall,
      result: failure,
    });
    return failure;
  }

  private parseInput(
    tool: AnyTool,
    call: ToolCall,
  ): { success: true; input: unknown } | { success: false; error: unknown } {
    try {
      const rawInput = parseMaybeJsonObject(call.arguments);
      const parsed = tool.schema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: new ToolInputError(`Invalid input for tool "${tool.name}".`, {
            tool: tool.name,
            issues: parsed.error.issues,
          }),
        };
      }

      return { success: true, input: parsed.data };
    } catch (error) {
      return {
        success: false,
        error: new ToolInputError(
          `Tool "${tool.name}" received malformed JSON arguments.`,
          {
            tool: tool.name,
          },
          error,
        ),
      };
    }
  }

  private async executeOnce(
    tool: AnyTool,
    input: unknown,
    runId: string,
    call: ToolCall,
    logs: ToolExecutionLog[],
    metadata: Metadata,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = Math.max(1, tool.timeout);
    const timeout = new Promise<never>((_, reject) => {
      const handle = setTimeout(() => {
        controller.abort();
        reject(
          new ToolTimeoutError(`Tool "${tool.name}" timed out after ${timeoutMs}ms.`, {
            tool: tool.name,
            timeoutMs,
          }),
        );
      }, timeoutMs);
      controller.signal.addEventListener("abort", () => clearTimeout(handle), { once: true });
    });

    try {
      return await Promise.race([
        Promise.resolve(
          tool.execute(input, {
            runId,
            toolCallId: call.id,
            signal: controller.signal,
            metadata,
            log(message: string, data?: unknown): void {
              logs.push({
                timestamp: nowIso(),
                message,
                ...(data !== undefined ? { data } : {}),
              });
            },
          }),
        ),
        timeout,
      ]);
    } finally {
      controller.abort();
    }
  }

  private retryDelay(
    backoff: number | ((attempt: number) => number) | undefined,
    attempt: number,
  ): number {
    if (typeof backoff === "function") {
      return Math.max(0, backoff(attempt));
    }

    return Math.max(0, backoff ?? 0);
  }
}

export function createTool<TSchema extends z.ZodTypeAny, TResult>(
  tool: ToolDefinition<TSchema, TResult>,
): ToolDefinition<TSchema, TResult> {
  return tool;
}
