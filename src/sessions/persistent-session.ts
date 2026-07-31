import type { StorageAdapter } from "../storage/storage-adapter";
import type { Message } from "../types/message";

export interface SessionData {
  messages: Message[];
  values: Record<string, unknown>;
}

export class PersistentSession {
  private readonly messagesKey: string;
  private readonly valuesKey: string;

  constructor(
    readonly id: string,
    private readonly storage: StorageAdapter,
  ) {
    this.messagesKey = `session:${id}:messages`;
    this.valuesKey = `session:${id}:values`;
  }

  async getMessages(): Promise<Message[]> {
    return (await this.storage.get<Message[]>(this.messagesKey)) ?? [];
  }

  async setMessages(messages: Message[]): Promise<void> {
    await this.storage.set(this.messagesKey, [...messages]);
  }

  async appendMessages(messages: Message[]): Promise<void> {
    const existing = await this.getMessages();
    await this.setMessages([...existing, ...messages]);
  }

  async getValue<T>(key: string): Promise<T | undefined> {
    const values = await this.getValues();
    return values[key] as T | undefined;
  }

  async setValue<T>(key: string, value: T): Promise<void> {
    const values = await this.getValues();
    values[key] = value;
    await this.storage.set(this.valuesKey, values);
  }

  async getValues(): Promise<Record<string, unknown>> {
    return (await this.storage.get<Record<string, unknown>>(this.valuesKey)) ?? {};
  }

  async clear(): Promise<void> {
    await this.storage.delete(this.messagesKey);
    await this.storage.delete(this.valuesKey);
  }
}
