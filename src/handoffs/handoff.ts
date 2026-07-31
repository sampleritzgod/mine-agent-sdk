import type { Metadata } from "../types/json";
import type { HandoffRequest } from "../types/model";

export interface HandoffContext {
  runId: string;
  metadata: Metadata;
}

export interface HandoffResult {
  output: unknown;
  metadata?: Metadata;
}

export interface HandoffDefinition {
  name: string;
  description: string;
  execute(request: HandoffRequest, context: HandoffContext): Promise<HandoffResult> | HandoffResult;
  metadata: Metadata;
}
