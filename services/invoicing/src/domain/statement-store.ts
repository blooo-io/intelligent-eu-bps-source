import type { StatementTotals } from "./statement.js";
import type { InvoiceWrite } from "./store.js";

/** REQ-059 — one participant statement per (participant, community, period). */
export type StatementRecord = StatementTotals & {
  statementId: string;
  participantId: string;
  communityId: string;
  period: string;
  periodFrom: string;
  periodUntil: string;
  currency: string;
  revision: number;
  issuedAt: string;
  updatedAt: string;
};

type StatementWrite = Extract<InvoiceWrite, { kind: "statement" }>;

/** REQ-059 — statement cache, recorded with the invoices and the outbox (INT-356). */
export class StatementStore {
  private readonly byId = new Map<string, StatementRecord>();
  private recording = false;
  private writes: StatementWrite[] = [];

  beginRecording(): void {
    this.recording = true;
    this.writes = [];
  }

  takeRecording(): StatementWrite[] {
    this.recording = false;
    return this.writes.splice(0);
  }

  stopRecording(): void {
    this.recording = false;
    this.writes = [];
  }

  snapshot(): string {
    return JSON.stringify([...this.byId.values()]);
  }

  restore(snapshot: string): void {
    const rows = JSON.parse(snapshot) as StatementRecord[];
    this.byId.clear();
    for (const row of rows) this.byId.set(row.statementId, structuredClone(row));
  }

  reset(): void {
    this.byId.clear();
  }

  upsert(row: StatementRecord): void {
    this.byId.set(row.statementId, structuredClone(row));
    if (this.recording) this.writes.push({ kind: "statement", row: structuredClone(row) });
  }

  find(participantId: string, communityId: string, period: string): StatementRecord | undefined {
    const row = [...this.byId.values()].find(
      (s) =>
        s.participantId === participantId &&
        s.communityId === communityId &&
        s.period === period,
    );
    return row ? structuredClone(row) : undefined;
  }

  listByParticipant(participantIds: string[]): StatementRecord[] {
    const ids = new Set(participantIds);
    return this.list().filter((s) => ids.has(s.participantId));
  }

  listByInvoice(invoiceId: string): StatementRecord[] {
    return this.list().filter((s) => s.invoiceIds.includes(invoiceId));
  }

  list(): StatementRecord[] {
    return [...this.byId.values()].map((s) => structuredClone(s));
  }
}
