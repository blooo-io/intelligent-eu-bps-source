import { canonicalPair } from "./netting.js";
import type { BillingRunRecord, PairSettlementRecord } from "./types.js";

/**
 * Immutable settlement store (BR-13): append-only; no overwrite of computed rows.
 */
export class SettlementStore {
  private readonly settlements = new Map<string, PairSettlementRecord>();
  private readonly runs = new Map<string, BillingRunRecord>();
  /** Carry-forward balances per unordered pair key, community currency. */
  private readonly carry = new Map<string, { communityId: string; amount: number }>();

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
  }

  appendRun(row: BillingRunRecord): void {
    if (this.runs.has(row.runId)) {
      throw new Error(`run ${row.runId} already exists`);
    }
    this.runs.set(row.runId, structuredClone(row));
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

  pairKey(x: string, y: string): string {
    return canonicalPair(x, y).join("|");
  }

  /** Signed carried balance of a pair: positive when `low` owes `high` (BR-05). */
  getCarry(x: string, y: string): number {
    const [low] = canonicalPair(x, y);
    const signed = this.carry.get(this.pairKey(x, y))?.amount ?? 0;
    return x === low ? signed : -signed;
  }

  /** Stores the balance carried to the next period, signed `x` → `y`. */
  setCarry(communityId: string, x: string, y: string, amount: number): void {
    const [low] = canonicalPair(x, y);
    const key = this.pairKey(x, y);
    if (amount === 0) {
      this.carry.delete(key);
      return;
    }
    this.carry.set(key, { communityId, amount: x === low ? amount : -amount });
  }

  /** Pairs with a non-zero carried balance, signed `low` → `high`. */
  listCarries(communityId: string): Array<{ low: string; high: string; amount: number }> {
    return [...this.carry.entries()]
      .filter(([, row]) => row.communityId === communityId)
      .map(([key, row]) => {
        const [low, high] = key.split("|") as [string, string];
        return { low, high, amount: row.amount };
      });
  }
}
