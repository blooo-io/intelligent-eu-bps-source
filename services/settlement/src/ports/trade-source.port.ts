import type { UnbilledTrade } from "../domain/types.js";

/** Narrow client of AC-04 GetUnbilledTrades (+ mark billed, INT-232). */
export interface TradeSourcePort {
  getUnbilled(communityId: string, until: string): Promise<UnbilledTrade[]>;
  /** Mark trades consumed by a settlement run so they drop from unbilled. */
  markBilled(tradeIds: string[]): Promise<void>;
  /** Operator seed — clear billed flags so the same trades can settle again. */
  resetBilled?(): Promise<void>;
}

export const TRADE_SOURCE = Symbol("TRADE_SOURCE");
