/** Stored trade copy for AC-04 (read-only market semantics, BR-11). */

export type StoredTrade = {
  tradeId: string;
  marketId: string;
  buyerActorId: string;
  sellerActorId: string;
  consumerId: string | null;
  producerId: string | null;
  communityId: string | null;
  kWh: string;
  /** EUR/kWh money string (BR-08). */
  price: string;
  /** Status as received from the market — never rewritten (BR-11). */
  status: string;
  deliveryStart: string;
  deliveryEnd: string;
  /** Set when settlement has consumed the trade for invoicing. */
  billed: boolean;
};

export type TradeDto = {
  tradeId: string;
  marketId: string;
  buyerActorId?: string;
  sellerActorId?: string;
  consumerId?: string;
  producerId?: string;
  kWh: string;
  price: string;
  status: string;
  deliveryStart?: string;
  deliveryEnd?: string;
};

export type IntakeAnomaly = {
  type: string;
  marketId: string;
  details?: string;
};
