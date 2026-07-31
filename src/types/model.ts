import type { Message } from "./message";
import type { Metadata } from "./json";

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  metadata?: Metadata;
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  schema: unknown;
  metadata: Metadata;
}

export interface HandoffRequest {
  target: string;
  input?: unknown;
  reason?: string;
  metadata?: Metadata;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface ModelRequest {
  messages: Message[];
  tools: ProviderToolDefinition[];
  metadata: Metadata;
}

export interface ModelResponse {
  id: string;
  content: string;
  toolCalls?: ToolCall[];
  handoff?: HandoffRequest;
  usage?: ModelUsage;
  finishReason?: string;
  raw?: unknown;
}

export interface ModelStreamChunk {
  id: string;
  delta: string;
  toolCallDelta?: Partial<ToolCall>;
  usage?: ModelUsage;
  done: boolean;
  raw?: unknown;
}
