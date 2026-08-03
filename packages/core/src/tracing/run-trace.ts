import type { SerializedError } from "../utils/errors";
import type { Metadata } from "../types/json";
import type { ModelUsage } from "../types/model";

export interface RunTrace {
  runId: string;
  agentName: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  model: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  costUsd: number;
  retries: number;
  toolCalls: number;
  handoffs: number;
  errors: SerializedError[];
  finalOutput?: string;
  metadata: Metadata;
}

export function emptyUsage(): RunTrace["tokens"] {
  return {
    input: 0,
    output: 0,
    total: 0,
  };
}

export function mergeUsage(target: RunTrace["tokens"], usage?: ModelUsage): void {
  if (!usage) {
    return;
  }

  target.input += usage.inputTokens ?? 0;
  target.output += usage.outputTokens ?? 0;
  target.total += usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}
