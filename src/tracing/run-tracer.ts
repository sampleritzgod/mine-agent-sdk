import { createId } from "../utils/id";
import { serializeError } from "../utils/errors";
import { durationMs, nowIso } from "../utils/time";
import type { Metadata } from "../types/json";
import type { ModelUsage } from "../types/model";
import type { ToolExecutionResult } from "../tools/tool";
import { emptyUsage, mergeUsage, type RunTrace } from "./run-trace";

export interface RunTracerOptions {
  agentName: string;
  provider: string;
  model: string;
  metadata?: Metadata;
}

export class RunTracer {
  readonly trace: RunTrace;

  constructor(options: RunTracerOptions) {
    this.trace = {
      runId: createId("run"),
      agentName: options.agentName,
      startedAt: nowIso(),
      provider: options.provider,
      model: options.model,
      tokens: emptyUsage(),
      costUsd: 0,
      retries: 0,
      toolCalls: 0,
      handoffs: 0,
      errors: [],
      metadata: options.metadata ?? {},
    };
  }

  recordModelUsage(usage?: ModelUsage): void {
    mergeUsage(this.trace.tokens, usage);
    this.trace.costUsd += usage?.costUsd ?? 0;
  }

  recordTool(result: ToolExecutionResult): void {
    this.trace.toolCalls += 1;
    this.trace.retries += Math.max(0, result.timing.attempts - 1);
    if (!result.success && result.error) {
      this.trace.errors.push(result.error);
    }
  }

  recordHandoff(): void {
    this.trace.handoffs += 1;
  }

  recordError(error: unknown): void {
    this.trace.errors.push(serializeError(error));
  }

  complete(finalOutput: string): RunTrace {
    const endedAt = nowIso();
    this.trace.endedAt = endedAt;
    this.trace.durationMs = durationMs(this.trace.startedAt, endedAt);
    this.trace.finalOutput = finalOutput;
    return this.trace;
  }

  fail(error: unknown): RunTrace {
    this.recordError(error);
    const endedAt = nowIso();
    this.trace.endedAt = endedAt;
    this.trace.durationMs = durationMs(this.trace.startedAt, endedAt);
    return this.trace;
  }
}
