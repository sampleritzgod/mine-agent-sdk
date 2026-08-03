import type { Metadata } from "../types/json";

export type GuardrailPhase = "input" | "output";

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  metadata?: Metadata;
  // Replacement for the checked value; downstream guardrails and the run see this instead.
  value?: unknown;
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
