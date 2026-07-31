import type { Metadata } from "../types/json";

export type GuardrailPhase = "input" | "output";

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  metadata?: Metadata;
}

export interface GuardrailContext {
  runId: string;
  phase: GuardrailPhase;
  metadata: Metadata;
}

export interface Guardrail {
  name: string;
  description?: string;
  phase: GuardrailPhase;
  execute(value: unknown, context: GuardrailContext): Promise<GuardrailResult> | GuardrailResult;
}
