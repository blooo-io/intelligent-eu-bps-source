/** REQ-015 / REQ-060 — Connect payout records, one or more attempts per (participant, period). */

export type PayoutStatus = "requested" | "in_transit" | "paid" | "failed" | "canceled";

export type PayoutRecord = {
  payoutId: string;
  participantId: string;
  communityId: string;
  period: string;
  amount: string;
  currency: string;
  status: PayoutStatus;
  trigger: "participant" | "auto";
  attempt: number;
  pspPayoutRef: string | null;
  invoiceIds: string[];
  requestedAt: string;
  arrivalDate?: string;
  failureCategory?: string;
};

export type PayoutWrite = { kind: "payout"; row: PayoutRecord };

/** A period with one of these payouts is not withdrawable again. */
export const ACTIVE_PAYOUT_STATUSES: readonly PayoutStatus[] = ["requested", "in_transit", "paid"];

export class PayoutsStore {
  private readonly byId = new Map<string, PayoutRecord>();
  private recording = false;
  private writes: PayoutWrite[] = [];

  beginRecording(): void {
    this.recording = true;
    this.writes = [];
  }

  takeRecording(): PayoutWrite[] {
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
    const rows = JSON.parse(snapshot) as PayoutRecord[];
    this.byId.clear();
    for (const row of rows) this.byId.set(row.payoutId, structuredClone(row));
  }

  reset(): void {
    this.byId.clear();
  }

  put(row: PayoutRecord): void {
    this.byId.set(row.payoutId, structuredClone(row));
    if (this.recording) this.writes.push({ kind: "payout", row: structuredClone(row) });
  }

  get(payoutId: string): PayoutRecord | undefined {
    const row = this.byId.get(payoutId);
    return row ? structuredClone(row) : undefined;
  }

  findByPspPayoutRef(pspPayoutRef: string): PayoutRecord | undefined {
    for (const row of this.byId.values()) {
      if (row.pspPayoutRef === pspPayoutRef) return structuredClone(row);
    }
    return undefined;
  }

  /** Oldest attempt first. */
  listForPeriod(participantId: string, period: string): PayoutRecord[] {
    return this.listForParticipant(participantId).filter((p) => p.period === period);
  }

  /** Oldest request first; attempts of one period in attempt order. */
  listForParticipant(participantId: string): PayoutRecord[] {
    return [...this.byId.values()]
      .filter((p) => p.participantId === participantId)
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.attempt - b.attempt)
      .map((p) => structuredClone(p));
  }
}
