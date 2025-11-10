import type { UnbilledTrade } from "../domain/types.js";

/** Narrow client of AC-04 GetUnbilledTrades. */
export interface TradeSourcePort {
  getUnbilled(communityId: string, until: string): Promise<UnbilledTrade[]>;
}

export const TRADE_SOURCE = Symbol("TRADE_SOURCE");
