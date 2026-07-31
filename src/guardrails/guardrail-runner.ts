import { GuardrailError } from "../errors/sdk-error";
import { EventBus } from "../events/event-bus";
import type { Metadata } from "../types/json";
import type { Guardrail, GuardrailPhase } from "./guardrail";

export interface GuardrailRunnerOptions {
  events?: EventBus;
}

export class GuardrailRunner {
  private readonly events: EventBus | undefined;

  constructor(
    private readonly guardrails: Guardrail[] = [],
    options: GuardrailRunnerOptions = {},
  ) {
    this.events = options.events;
  }

  async check(phase: GuardrailPhase, value: unknown, runId: string, metadata: Metadata = {}): Promise<void> {
    for (const guardrail of this.guardrails) {
      if (guardrail.phase !== phase) {
        continue;
      }

      const result = await guardrail.execute(value, {
        runId,
        phase,
        metadata,
      });

      if (!result.allowed) {
        const reason = result.reason ?? `Guardrail "${guardrail.name}" blocked ${phase}.`;
        this.events?.emit("guardrail.triggered", {
          runId,
          name: guardrail.name,
          phase,
          reason,
          metadata: result.metadata ?? {},
        });
        throw new GuardrailError(reason, {
          guardrail: guardrail.name,
          phase,
          metadata: result.metadata ?? {},
        });
      }
    }
  }
}
