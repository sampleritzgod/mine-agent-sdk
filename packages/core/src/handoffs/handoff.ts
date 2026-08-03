import type { Metadata } from "../types/json";
import type { Message } from "../types/message";
import type { HandoffRequest } from "../types/model";

export interface HandoffContext {
  runId: string;
  metadata: Metadata;
  /** Full conversation so far, so the receiving handler/agent has the same context as the caller. */
  messages: Message[];
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
