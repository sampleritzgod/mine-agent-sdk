import type { Message } from "../types/message";

export interface RuntimeMemory {
  loadMessages(sessionId: string): Promise<Message[]>;
  saveMessages(sessionId: string, messages: Message[]): Promise<void>;
  appendMessages(sessionId: string, messages: Message[]): Promise<void>;
}
