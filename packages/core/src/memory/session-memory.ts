import { type SessionManager } from "../sessions/session-manager";
import type { Message } from "../types/message";
import type { RuntimeMemory } from "./runtime-memory";

export class SessionMemory implements RuntimeMemory {
  private readonly sessions: SessionManager;

  constructor(sessions: SessionManager) {
    this.sessions = sessions;
  }

  async loadMessages(sessionId: string): Promise<Message[]> {
    return this.sessions.getSession(sessionId).getMessages();
  }

  async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    await this.sessions.getSession(sessionId).setMessages(messages);
  }

  async appendMessages(sessionId: string, messages: Message[]): Promise<void> {
    await this.sessions.getSession(sessionId).appendMessages(messages);
  }
}
