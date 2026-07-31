import { EventBus } from "../events/event-bus";
import type { Guardrail } from "../guardrails/guardrail";
import type { HandoffDefinition } from "../handoffs/handoff";
import type { ModelProvider } from "../providers/model-provider";
import type { AnyTool } from "../tools/tool";
import type { Metadata } from "../types/json";
import type { AgentPlugin } from "./plugin";

export interface PluginHostResult {
  provider?: ModelProvider;
  tools: AnyTool[];
  guardrails: Guardrail[];
  handoffs: HandoffDefinition[];
}

export class PluginHost {
  private result: PluginHostResult | undefined;

  constructor(
    private readonly plugins: AgentPlugin[] = [],
    private readonly events: EventBus = new EventBus(),
    private readonly metadata: Metadata = {},
  ) {}

  async setup(): Promise<PluginHostResult> {
    const result: PluginHostResult = {
      tools: [],
      guardrails: [],
      handoffs: [],
    };

    for (const plugin of this.plugins) {
      await plugin.setup({
        registerTool(tool: AnyTool): void {
          result.tools.push(tool);
        },
        registerGuardrail(guardrail: Guardrail): void {
          result.guardrails.push(guardrail);
        },
        registerHandoff(handoff: HandoffDefinition): void {
          result.handoffs.push(handoff);
        },
        setProvider(provider: ModelProvider): void {
          result.provider = provider;
        },
        events: this.events,
        metadata: this.metadata,
      });
    }

    this.result = result;
    return result;
  }

  async init(): Promise<void> {
    const result = this.result ?? { tools: [], guardrails: [], handoffs: [] };

    for (const plugin of this.plugins) {
      await plugin.init?.({
        events: this.events,
        metadata: this.metadata,
        tools: result.tools,
        guardrails: result.guardrails,
        handoffs: result.handoffs,
        ...(result.provider ? { provider: result.provider } : {}),
      });
    }
  }

  async teardown(): Promise<void> {
    for (const plugin of [...this.plugins].reverse()) {
      await plugin.teardown?.({
        events: this.events,
        metadata: this.metadata,
      });
    }
  }
}
