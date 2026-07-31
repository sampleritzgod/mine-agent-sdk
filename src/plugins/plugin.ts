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

export interface PluginInitContext {
  events: EventBus;
  metadata: Metadata;
  // The full merged registry from every plugin's setup(), not just this plugin's own.
  tools: readonly AnyTool[];
  guardrails: readonly Guardrail[];
  handoffs: readonly HandoffDefinition[];
  provider?: ModelProvider;
}

export interface PluginTeardownContext {
  events: EventBus;
  metadata: Metadata;
}

export interface AgentPlugin {
  name: string;
  version?: string;
  setup(context: PluginContext): void | Promise<void>;
  // Runs once after every plugin has registered, so a plugin can react to the full set and hook into runtime events.
  init?(context: PluginInitContext): void | Promise<void>;
  // Runs in reverse registration order when the owning Agent is torn down.
  teardown?(context: PluginTeardownContext): void | Promise<void>;
}
