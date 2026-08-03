import type { StorageAdapter } from "../storage/storage-adapter";
import { PersistentSession } from "./persistent-session";

export class SessionManager {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  getSession(id: string): PersistentSession {
    return new PersistentSession(id, this.storage);
  }
}
