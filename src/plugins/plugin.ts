import type { EventBus } from "../events/event-bus";
import type { Guardrail } from "../guardrails/guardrail";
import type { HandoffDefinition } from "../handoffs/handoff";
import type { ModelProvider } from "../providers/model-provider";
import type { AnyTool } from "../tools/tool";
import type { Metadata } from "../types/json";

export interface PluginContext {
  registerTool(tool: AnyTool): void;
  registerGuardrail(guardrail: Guardrail): void;
  registerHandoff(handoff: HandoffDefinition): void;
  setProvider(provider: ModelProvider): void;
  events: EventBus;
  metadata: Metadata;
}

export interface AgentPlugin {
  name: string;
  version?: string;
  setup(context: PluginContext): void | Promise<void>;
}
