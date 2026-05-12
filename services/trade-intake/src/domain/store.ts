import type { IntakeAnomaly, StoredTrade } from "./types.js";

/**
 * In-memory trade store for V1. Deduplicates on tradeId (BR-01).
 * Status is immutable once written (BR-11).
 */
export class TradeStore {
  private trades = new Map<string, StoredTrade>();
  private anomalies: IntakeAnomaly[] = [];

  reset(): void {
    this.trades.clear();
    this.anomalies = [];
  }

  get(tradeId: string): StoredTrade | undefined {
    const row = this.trades.get(tradeId);
    return row ? structuredClone(row) : undefined;
  }

  /**
   * Insert if absent. If present, keep the original status and fields (BR-01, BR-11).
   * Returns true when a new row was stored.
   */
  insertOnce(row: StoredTrade): boolean {
    if (this.trades.has(row.tradeId)) {
      return false;
    }
    this.trades.set(row.tradeId, structuredClone(row));
    return true;
  }

  listUnbilled(filter: {
    until: string;
    communityId?: string;
    consumerId?: string;
    producerId?: string;
  }): StoredTrade[] {
    return [...this.trades.values()]
      .filter((t) => !t.billed)
      .filter((t) => t.deliveryEnd <= filter.until)
      .filter((t) =>
        filter.communityId ? t.communityId === filter.communityId : true,
      )
      .filter((t) =>
        filter.consumerId ? t.consumerId === filter.consumerId : true,
      )
      .filter((t) =>
        filter.producerId ? t.producerId === filter.producerId : true,
      )
      .map((t) => structuredClone(t));
  }

  listByMarket(marketId: string): StoredTrade[] {
    return [...this.trades.values()]
      .filter((t) => t.marketId === marketId)
      .map((t) => structuredClone(t));
  }

  markBilled(tradeIds: string[]): void {
    for (const id of tradeIds) {
      const row = this.trades.get(id);
      if (row) {
        this.trades.set(id, { ...row, billed: true });
      }
    }
  }

  /** INT-232 — operator seed: re-open trades for another settlement run. */
  resetBilled(): void {
    for (const [id, row] of this.trades) {
      if (row.billed) {
        this.trades.set(id, { ...row, billed: false });
      }
    }
  }

  addAnomaly(anomaly: IntakeAnomaly): void {
    this.anomalies.push({ ...anomaly });
  }

  listAnomalies(): IntakeAnomaly[] {
    return this.anomalies.map((a) => ({ ...a }));
  }

  size(): number {
    return this.trades.size;
  }
}
