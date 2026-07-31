import type { EventBus } from "../events/event-bus";
import type { Guardrail } from "../guardrails/guardrail";
import type { HandoffDefinition } from "../handoffs/handoff";
import type { RuntimeMemory } from "../memory/runtime-memory";
import type { AgentPlugin } from "../plugins/plugin";
import type { ModelProvider } from "../providers/model-provider";
import type { AnyTool } from "../tools/tool";
import type { Metadata } from "../types/json";
import type { Message } from "../types/message";
import type { RunTrace } from "../tracing/run-trace";

export interface AgentConfig {
  name: string;
  instructions?: string;
  provider: ModelProvider;
  tools?: AnyTool[];
  guardrails?: Guardrail[];
  handoffs?: HandoffDefinition[];
  memory?: RuntimeMemory;
  eventBus?: EventBus;
  plugins?: AgentPlugin[];
  maxIterations?: number;
  metadata?: Metadata;
}

export type AgentInput = string | Message[];

export interface RunOptions {
  sessionId?: string;
  metadata?: Metadata;
}

export interface RunResult {
  runId: string;
  output: string;
  messages: Message[];
  trace: RunTrace;
}
