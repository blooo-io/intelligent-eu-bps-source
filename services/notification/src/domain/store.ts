import type { NotificationLogEntry } from "./types.js";

export class NotificationStore {
  private logs: NotificationLogEntry[] = [];
  /** V1 fixture: participantId → delivery address (not logged). */
  private readonly recipients = new Map<string, string>();

  reset(): void {
    this.logs = [];
    this.recipients.clear();
  }

  registerRecipient(participantId: string, email: string): void {
    this.recipients.set(participantId, email);
  }

  getRecipient(participantId: string): string | undefined {
    return this.recipients.get(participantId);
  }

  appendLog(row: NotificationLogEntry): void {
    this.logs.push(structuredClone(row));
  }

  listLogs(): NotificationLogEntry[] {
    return this.logs.map((r) => structuredClone(r));
  }
}
