import type { Message, MessageRole } from "../types/message";

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
  readonly runId: string;
  phase: RuntimePhase = "input";
  iteration = 0;
  readonly messages: Message[];

  constructor(runId: string, messages: Message[] = []) {
    this.runId = runId;
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

  updateLastMessageContent(role: MessageRole, content: string): boolean {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index];
      if (message?.role === role) {
        this.messages[index] = { ...message, content };
        return true;
      }
    }
    return false;
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
