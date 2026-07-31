import type { StorageAdapter } from "../storage/storage-adapter";
import { PersistentSession } from "./persistent-session";

export class SessionManager {
  constructor(private readonly storage: StorageAdapter) {}

  getSession(id: string): PersistentSession {
    return new PersistentSession(id, this.storage);
  }
}
