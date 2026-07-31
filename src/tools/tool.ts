import type { z } from "zod";
import type { Metadata } from "../types/json";
import type { ToolCall } from "../types/model";
import type { SerializedError } from "../utils/errors";

export interface RetryPolicy {
  attempts: number;
  backoffMs?: number | ((attempt: number) => number);
}

export interface ToolExecutionLog {
  timestamp: string;
  message: string;
  data?: unknown;
}

export interface ToolExecutionTiming {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  attempts: number;
}

export interface ToolExecutionContext {
  runId: string;
  toolCallId: string;
  signal: AbortSignal;
  metadata: Metadata;
  log(message: string, data?: unknown): void;
}

export interface ToolExecutionResult<TResult = unknown> {
  success: boolean;
  error?: SerializedError;
  timing: ToolExecutionTiming;
  logs: ToolExecutionLog[];
  result?: TResult;
}

export interface ToolDefinition<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TResult = unknown,
> {
  name: string;
  description: string;
  schema: TSchema;
  execute(
    input: z.infer<TSchema>,
    context: ToolExecutionContext,
  ): Promise<TResult> | TResult;
  timeout: number;
  retry: RetryPolicy;
  metadata: Metadata;
}

export type AnyTool = ToolDefinition<z.ZodTypeAny, unknown>;

export interface ToolExecutorRequest {
  runId: string;
  toolCall: ToolCall;
  metadata?: Metadata;
}
