import type { BillingRunRecord, PairSettlementRecord } from "./types.js";

/**
 * Immutable settlement store (BR-13): append-only; no overwrite of computed rows.
 */
export class SettlementStore {
  private settlements = new Map<string, PairSettlementRecord>();
  private runs = new Map<string, BillingRunRecord>();
  /** Carry-forward balances per unordered pair key, community currency. */
  private carry = new Map<string, number>();

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

  pairKey(consumerId: string, producerId: string): string {
    return [consumerId, producerId].sort().join("|");
  }

  getCarry(consumerId: string, producerId: string): number {
    return this.carry.get(this.pairKey(consumerId, producerId)) ?? 0;
  }

  setCarry(consumerId: string, producerId: string, amount: number): void {
    this.carry.set(this.pairKey(consumerId, producerId), amount);
  }
}
