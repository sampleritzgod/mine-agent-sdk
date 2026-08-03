import { ConfigurationError } from "../errors/sdk-error";
import type { Metadata } from "../types/json";
import type { Message } from "../types/message";
import type { HandoffRequest } from "../types/model";
import type { HandoffDefinition, HandoffResult } from "./handoff";

export class HandoffManager {
  private readonly handoffs = new Map<string, HandoffDefinition>();

  constructor(handoffs: HandoffDefinition[] = []) {
    for (const handoff of handoffs) {
      this.register(handoff);
    }
  }

  register(handoff: HandoffDefinition): this {
    if (this.handoffs.has(handoff.name)) {
      throw new ConfigurationError(`Handoff "${handoff.name}" is already registered.`, {
        handoff: handoff.name,
      });
    }

    this.handoffs.set(handoff.name, handoff);
    return this;
  }

  has(name: string): boolean {
    return this.handoffs.has(name);
  }

  async execute(
    request: HandoffRequest,
    runId: string,
    metadata: Metadata = {},
    messages: Message[] = [],
  ): Promise<HandoffResult> {
    const handoff = this.handoffs.get(request.target);
    if (!handoff) {
      throw new ConfigurationError(`No handoff registered for "${request.target}".`, {
        handoff: request.target,
      });
    }

    return handoff.execute(request, {
      runId,
      metadata,
      messages,
    });
  }
}
