import {
  ConfigurationError,
  MaxIterationsError,
  ProviderError,
  ToolExecutionError,
} from "../errors/sdk-error";
import { EventBus } from "../events/event-bus";
import { GuardrailRunner } from "../guardrails/guardrail-runner";
import { HandoffManager } from "../handoffs/handoff-manager";
import { RunTracer } from "../tracing/run-tracer";
import { ToolExecutor } from "../tools/tool-executor";
import { ToolRegistry } from "../tools/tool-registry";
import type { ToolExecutionResult } from "../tools/tool";
import type { AgentConfig, AgentInput, RunOptions, RunResult } from "../core/agent-config";
import type { Metadata } from "../types/json";
import type { HandoffRequest, ModelRequest, ToolCall } from "../types/model";
import {
  assistantMessage,
  systemMessage,
  toolMessage,
  userMessage,
  type Message,
} from "../types/message";
import { serializeError } from "../utils/errors";
import { safeJsonStringify } from "../utils/json";
import { durationMs, nowIso } from "../utils/time";
import { RuntimeState } from "./runtime-state";

const TRANSIENT_METADATA_KEY = "sdk.transient";

export class AgentRuntime {
  private readonly events: EventBus;
  private readonly tools: ToolRegistry;
  private readonly toolExecutor: ToolExecutor;
  private readonly guardrails: GuardrailRunner;
  private readonly handoffs: HandoffManager;
  private readonly maxIterations: number;

  constructor(private readonly config: AgentConfig) {
    if (config.name.trim().length === 0) {
      throw new ConfigurationError("Agent name cannot be empty.");
    }

    this.events = config.eventBus ?? new EventBus();
    this.tools = new ToolRegistry(config.tools ?? []);
    if (this.tools.list().length > 0 && !config.provider.supportsTools()) {
      throw new ConfigurationError(`Provider "${config.provider.id}" does not support tools.`);
    }

    this.toolExecutor = new ToolExecutor({ events: this.events });
    this.guardrails = new GuardrailRunner(config.guardrails ?? [], { events: this.events });
    this.handoffs = new HandoffManager(config.handoffs ?? []);
    this.maxIterations = Math.max(1, config.maxIterations ?? 20);
  }

  async run(input: AgentInput, options: RunOptions = {}): Promise<RunResult> {
    const metadata = {
      ...(this.config.metadata ?? {}),
      ...(options.metadata ?? {}),
    };
    const tracer = new RunTracer({
      agentName: this.config.name,
      provider: this.config.provider.id,
      model: this.config.provider.model,
      metadata,
    });
    const runId = tracer.trace.runId;
    const state = new RuntimeState(runId);

    this.events.emit("run.started", {
      runId,
      agentName: this.config.name,
      startedAt: tracer.trace.startedAt,
      metadata,
    });

    try {
      const inputMessages = this.normalizeInput(input);
      state.addMessages(await this.prepareMessages(inputMessages, options.sessionId));
      await this.guardrails.check("input", inputMessages, runId, metadata);

      while (state.iteration < this.maxIterations) {
        state.nextIteration();
        state.transition("model");
        const request: ModelRequest = {
          messages: [...state.messages],
          tools: this.tools.toProviderTools(),
          metadata,
        };
        this.events.emit("model.request", { runId, request });

        const response = await this.callProvider(request);
        tracer.recordModelUsage(response.usage);
        this.events.emit("model.response", { runId, response });

        state.addMessage(assistantMessage(response.content, response.toolCalls, {
          providerResponseId: response.id,
          iteration: state.iteration,
        }));

        if (response.handoff) {
          const output = await this.performHandoff(response.handoff, runId, metadata, tracer);
          return await this.completeRun(output, state, tracer, options.sessionId, metadata);
        }

        state.transition("tool_detection");
        const toolCalls = response.toolCalls ?? [];
        if (toolCalls.length === 0) {
          return await this.completeRun(response.content, state, tracer, options.sessionId, metadata);
        }

        for (const toolCall of toolCalls) {
          state.transition("execute_tool");
          const result = await this.executeTool(runId, toolCall, metadata);
          tracer.recordTool(result);

          state.transition("store_result");
          state.addMessage(toolMessage(
            toolCall.name,
            toolCall.id,
            safeJsonStringify(result.success ? result.result : result.error),
            {
              success: result.success,
              timing: result.timing,
            },
          ));
        }
      }

      throw new MaxIterationsError(`Agent exceeded ${this.maxIterations} iterations.`, {
        maxIterations: this.maxIterations,
      });
    } catch (error) {
      state.transition("failed");
      const trace = tracer.fail(error);
      this.events.emit("run.failed", {
        runId,
        error: serializeError(error),
        trace,
      });
      throw error;
    }
  }

  private async callProvider(request: ModelRequest) {
    try {
      return await this.config.provider.generate(request);
    } catch (error) {
      throw new ProviderError(`Provider "${this.config.provider.id}" failed to generate a response.`, {
        provider: this.config.provider.id,
        model: this.config.provider.model,
      }, error);
    }
  }

  private async executeTool(
    runId: string,
    toolCall: ToolCall,
    metadata: Metadata,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      const result = this.unknownToolResult(toolCall);
      this.events.emit("tool.started", { runId, toolCall, attempt: 1 });
      this.events.emit("tool.failed", { runId, toolCall, result });
      return result;
    }

    return this.toolExecutor.execute(tool, {
      runId,
      toolCall,
      metadata,
    });
  }

  private unknownToolResult(toolCall: ToolCall): ToolExecutionResult {
    const startedAt = nowIso();
    const endedAt = nowIso();
    return {
      success: false,
      error: serializeError(new ToolExecutionError(`Tool "${toolCall.name}" is not registered.`, {
        tool: toolCall.name,
      })),
      timing: {
        startedAt,
        endedAt,
        durationMs: durationMs(startedAt, endedAt),
        attempts: 1,
      },
      logs: [],
    };
  }

  private async performHandoff(
    request: HandoffRequest,
    runId: string,
    metadata: Metadata,
    tracer: RunTracer,
  ): Promise<string> {
    this.events.emit("handoff.started", {
      runId,
      target: request.target,
      ...(request.input !== undefined ? { input: request.input } : {}),
      ...(request.reason ? { reason: request.reason } : {}),
    });
    const result = await this.handoffs.execute(request, runId, metadata);
    tracer.recordHandoff();
    this.events.emit("handoff.completed", {
      runId,
      target: request.target,
      output: result.output,
    });
    return safeJsonStringify(result.output);
  }

  private async completeRun(
    output: string,
    state: RuntimeState,
    tracer: RunTracer,
    sessionId: string | undefined,
    metadata: Metadata,
  ): Promise<RunResult> {
    state.transition("final_answer");
    await this.guardrails.check("output", output, state.runId, metadata);
    await this.persistMessages(sessionId, state.messages);

    state.transition("trace");
    const trace = tracer.complete(output);
    state.transition("completed");
    this.events.emit("run.completed", {
      runId: state.runId,
      output,
      trace,
    });

    return {
      runId: state.runId,
      output,
      messages: [...state.messages],
      trace,
    };
  }

  private normalizeInput(input: AgentInput): Message[] {
    if (typeof input === "string") {
      return [userMessage(input)];
    }

    return [...input];
  }

  private async prepareMessages(inputMessages: Message[], sessionId?: string): Promise<Message[]> {
    const messages: Message[] = [];
    if (this.config.instructions) {
      messages.push(systemMessage(this.config.instructions, {
        [TRANSIENT_METADATA_KEY]: true,
      }));
    }

    if (sessionId && this.config.memory) {
      messages.push(...await this.config.memory.loadMessages(sessionId));
    }

    messages.push(...inputMessages);
    return messages;
  }

  private async persistMessages(sessionId: string | undefined, messages: Message[]): Promise<void> {
    if (!sessionId || !this.config.memory) {
      return;
    }

    const persisted = messages.filter(message => message.metadata?.[TRANSIENT_METADATA_KEY] !== true);
    await this.config.memory.saveMessages(sessionId, persisted);
  }
}
