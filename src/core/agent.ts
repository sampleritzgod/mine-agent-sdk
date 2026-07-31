import { EventBus } from "../events/event-bus";
import { PluginHost } from "../plugins/plugin-host";
import { AgentRuntime } from "../runtime/agent-runtime";
import type { AgentConfig, AgentInput, RunOptions, RunResult } from "./agent-config";

export class Agent {
  private readonly runtime: AgentRuntime;

  constructor(private readonly config: AgentConfig) {
    this.runtime = new AgentRuntime(config);
  }

  static async create(config: AgentConfig): Promise<Agent> {
    if (!config.plugins || config.plugins.length === 0) {
      return new Agent(config);
    }

    const eventBus = config.eventBus ?? new EventBus();
    const host = new PluginHost(config.plugins, eventBus, config.metadata ?? {});
    const pluginResult = await host.setup();
    return new Agent({
      ...config,
      eventBus,
      provider: pluginResult.provider ?? config.provider,
      tools: [...(config.tools ?? []), ...pluginResult.tools],
      guardrails: [...(config.guardrails ?? []), ...pluginResult.guardrails],
      handoffs: [...(config.handoffs ?? []), ...pluginResult.handoffs],
      plugins: [],
    });
  }

  run(input: AgentInput, options?: RunOptions): Promise<RunResult> {
    return this.runtime.run(input, options);
  }
}
