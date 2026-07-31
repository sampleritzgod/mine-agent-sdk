import type { Message } from "../types/message";

export type RuntimePhase =
  | "input"
  | "model"
  | "tool_detection"
  | "execute_tool"
  | "store_result"
  | "handoff"
  | "final_answer"
  | "trace"
  | "completed"
  | "failed";

export class RuntimeState {
  phase: RuntimePhase = "input";
  iteration = 0;
  readonly messages: Message[];

  constructor(
    readonly runId: string,
    messages: Message[] = [],
  ) {
    this.messages = [...messages];
  }

  transition(phase: RuntimePhase): void {
    this.phase = phase;
  }

  nextIteration(): number {
    this.iteration += 1;
    return this.iteration;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  addMessages(messages: Message[]): void {
    this.messages.push(...messages);
  }

  snapshot(): Readonly<{
    runId: string;
    phase: RuntimePhase;
    iteration: number;
    messages: Message[];
  }> {
    return {
      runId: this.runId,
      phase: this.phase,
      iteration: this.iteration,
      messages: [...this.messages],
    };
  }
}
