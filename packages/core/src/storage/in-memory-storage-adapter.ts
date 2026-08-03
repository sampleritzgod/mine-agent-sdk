import type { StorageAdapter } from "./storage-adapter";

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.values.get(key) as T | undefined);
  }

  set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  list(prefix: string): Promise<string[]> {
    return Promise.resolve([...this.values.keys()].filter((key) => key.startsWith(prefix)));
  }
}
