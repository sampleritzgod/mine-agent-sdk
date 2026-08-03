import { GuardrailError } from "../errors/sdk-error";
import { type EventBus } from "../events/event-bus";
import type { Metadata } from "../types/json";
import type { Guardrail, GuardrailPhase } from "./guardrail";

export interface GuardrailRunnerOptions {
  events?: EventBus;
}

export class GuardrailRunner {
  private readonly guardrails: Guardrail[];
  private readonly events: EventBus | undefined;

  constructor(guardrails: Guardrail[] = [], options: GuardrailRunnerOptions = {}) {
    this.guardrails = guardrails;
    this.events = options.events;
  }

  async check<T>(
    phase: GuardrailPhase,
    value: T,
    runId: string,
    metadata: Metadata = {},
  ): Promise<T> {
    let current = value;

    for (const guardrail of this.guardrails) {
      if (guardrail.phase !== phase) {
        continue;
      }

      const result = await guardrail.execute(current, {
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

      if (result.value !== undefined) {
        current = result.value as T;
        this.events?.emit("guardrail.modified", {
          runId,
          name: guardrail.name,
          phase,
          metadata: result.metadata ?? {},
        });
      }
    }

    return current;
  }
}
