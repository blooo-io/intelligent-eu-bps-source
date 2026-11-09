import { type Dec, ZERO, neg } from "./decimal.js";
import { canonicalPair } from "./netting.js";
import type { BillingRunRecord, PairSettlementRecord } from "./types.js";

export type SettlementWrite =
  | { kind: "settlement"; row: PairSettlementRecord }
  | { kind: "run"; row: BillingRunRecord }
  | { kind: "carry"; key: string; communityId: string; amount: string | null };

/**
 * Immutable settlement store (BR-13): append-only; no overwrite of computed rows.
 * INT-356 — while recording, mutations are replayed with the outbox in one
 * Postgres transaction. The in-memory maps stay the read model.
 */
export class SettlementStore {
  private readonly settlements = new Map<string, PairSettlementRecord>();
  private readonly runs = new Map<string, BillingRunRecord>();
  /** Carry-forward balances per unordered pair key, community currency. */
  private readonly carry = new Map<string, { communityId: string; amount: Dec }>();
  private recording = false;
  private writes: SettlementWrite[] = [];

  beginRecording(): void {
    this.recording = true;
    this.writes = [];
  }

  takeRecording(): SettlementWrite[] {
    this.recording = false;
    return this.writes.splice(0);
  }

  stopRecording(): void {
    this.recording = false;
    this.writes = [];
  }

  snapshot(): string {
    return JSON.stringify({
      settlements: [...this.settlements.entries()],
      runs: [...this.runs.entries()],
      carry: [...this.carry.entries()].map(([key, row]) => [
        key,
        { communityId: row.communityId, amount: row.amount.toString() },
      ]),
    });
  }

  restore(snapshot: string): void {
    const data = JSON.parse(snapshot) as {
      settlements: Array<[string, PairSettlementRecord]>;
      runs: Array<[string, BillingRunRecord]>;
      carry: Array<[string, { communityId: string; amount: string }]>;
    };
    this.settlements.clear();
    this.runs.clear();
    this.carry.clear();
    for (const [id, row] of data.settlements) this.settlements.set(id, row);
    for (const [id, row] of data.runs) this.runs.set(id, row);
    for (const [key, row] of data.carry) {
      this.carry.set(key, { communityId: row.communityId, amount: BigInt(row.amount) });
    }
  }

  reset(): void {
    this.settlements.clear();
    this.runs.clear();
    this.carry.clear();
  }

  getSettlement(id: string): PairSettlementRecord | undefined {
    const row = this.settlements.get(id);
    return row ? structuredClone(row) : undefined;
  }

  /** BR-13 — refuse overwrite of an existing settlementId. */
  appendSettlement(row: PairSettlementRecord): void {
    if (this.settlements.has(row.settlementId)) {
      throw new Error(`settlement ${row.settlementId} already exists`);
    }
    this.settlements.set(row.settlementId, structuredClone(row));
    if (this.recording) {
      this.writes.push({ kind: "settlement", row: structuredClone(row) });
    }
  }

  appendRun(row: BillingRunRecord): void {
    if (this.runs.has(row.runId)) {
      throw new Error(`run ${row.runId} already exists`);
    }
    this.runs.set(row.runId, structuredClone(row));
    if (this.recording) {
      this.writes.push({ kind: "run", row: structuredClone(row) });
    }
  }

  getRun(runId: string): BillingRunRecord | undefined {
    const row = this.runs.get(runId);
    return row ? structuredClone(row) : undefined;
  }

  /**
   * INT-278 / BR-13 — next append-only version for community+period
   * (correction creates a new version; never overwrite).
   */
  nextRunVersion(communityId: string, period: string): number {
    let max = 0;
    for (const run of this.runs.values()) {
      if (run.communityId === communityId && run.period === period) {
        max = Math.max(max, run.version);
      }
    }
    return max + 1;
  }

  /** REQ-006 — the periodic run that closed this community period, if any. */
  findPeriodicRun(communityId: string, period: string): BillingRunRecord | undefined {
    for (const run of this.runs.values()) {
      if (run.communityId === communityId && run.period === period && run.type === "periodic") {
        return structuredClone(run);
      }
    }
    return undefined;
  }

  pairKey(x: string, y: string): string {
    return canonicalPair(x, y).join("|");
  }

  /** Signed carried balance of a pair: positive when `low` owes `high` (BR-05). */
  getCarry(x: string, y: string): Dec {
    const [low] = canonicalPair(x, y);
    const signed = this.carry.get(this.pairKey(x, y))?.amount ?? ZERO;
    return x === low ? signed : neg(signed);
  }

  /** Stores the balance carried to the next period, signed `x` → `y`. */
  setCarry(communityId: string, x: string, y: string, amount: Dec): void {
    const [low] = canonicalPair(x, y);
    const key = this.pairKey(x, y);
    const canonical = x === low ? amount : neg(amount);
    if (amount === ZERO) {
      this.carry.delete(key);
    } else {
      this.carry.set(key, { communityId, amount: canonical });
    }
    if (this.recording) {
      this.writes.push({
        kind: "carry",
        key,
        communityId,
        amount: amount === ZERO ? null : canonical.toString(),
      });
    }
  }

  /** Pairs with a non-zero carried balance, signed `low` → `high`. */
  listCarries(communityId: string): Array<{ low: string; high: string; amount: Dec }> {
    return [...this.carry.entries()]
      .filter(([, row]) => row.communityId === communityId)
      .map(([key, row]) => {
        const [low, high] = key.split("|") as [string, string];
        return { low, high, amount: row.amount };
      });
  }
}
