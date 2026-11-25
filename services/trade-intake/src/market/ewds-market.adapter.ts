/**
 * P-MKT live adapter — GSY DEX via EWDS request/reply (A8 / Task 4.9 / INT-440).
 * Windows are split into ≤ 86400 s chunks; only accepted statuses are returned.
 */
import {
  EwdsRemoteError,
  type RequestReplyClient,
} from "@intelligent/ewds-client";
import type {
  ClearingResult,
  MarketInfo,
  MarketPort,
  TimeWindow,
  TradeFixture,
  TradeStatus,
} from "@intelligent/mocks";

const DAY_S = 86_400;

type GsyTradeRow = {
  trade_id?: unknown;
  market_id?: unknown;
  buyer_id?: unknown;
  seller_id?: unknown;
  energy?: unknown;
  price?: unknown;
  adjusted_price?: unknown;
  status?: unknown;
  start_time?: unknown;
  end_time?: unknown;
};

type GsyMarketRow = {
  market_id?: unknown;
  community_id?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  mechanism?: unknown;
};

type GsyClearingRow = {
  market_id?: unknown;
  num_trades?: unknown;
  traded_quantity?: unknown;
};

export type EwdsMarketAdapterOpts = {
  acceptedStatuses?: string[];
  valueScale?: number;
};

function asNumber(value: unknown, scale: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new EwdsRemoteError("schema", `numeric field invalid: ${String(value)}`);
  }
  return n / scale;
}

/** Accept epoch seconds or RFC 3339; return ISO UTC. */
function asIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  if (typeof value === "string" && value.trim() !== "") {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
      throw new EwdsRemoteError("schema", `time field invalid: ${value}`);
    }
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  throw new EwdsRemoteError("schema", `time field missing: ${String(value)}`);
}

function asId(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  throw new EwdsRemoteError("schema", `trade lacks ${field}`);
}

/** Split [from, until) into contiguous epoch-second windows of at most DAY_S. */
export function splitWindowEpoch(
  fromIso: string,
  untilIso: string,
): Array<{ start: number; end: number }> {
  const start0 = Math.floor(Date.parse(fromIso) / 1000);
  const end0 = Math.floor(Date.parse(untilIso) / 1000);
  if (!(start0 < end0)) return [];
  const out: Array<{ start: number; end: number }> = [];
  let cursor = start0;
  while (cursor < end0) {
    const next = Math.min(cursor + DAY_S, end0);
    out.push({ start: cursor, end: next });
    cursor = next;
  }
  return out;
}

export class EwdsMarketAdapter implements MarketPort {
  private readonly accepted: Set<string>;
  private readonly valueScale: number;
  /** Exposed for tests — last request envelopes. */
  readonly calls: Array<{ op: string; payload: { start: number; end: number } | { marketId: string } }> =
    [];

  constructor(
    private readonly rr: RequestReplyClient,
    opts?: EwdsMarketAdapterOpts,
  ) {
    const statuses = (opts?.acceptedStatuses ?? ["settled"]).map((s) =>
      s.toLowerCase(),
    );
    this.accepted = new Set(statuses);
    this.valueScale = opts?.valueScale ?? 1;
  }

  async queryTrades(window: TimeWindow): Promise<TradeFixture[]> {
    const chunks = splitWindowEpoch(window.from, window.until);
    const byId = new Map<string, TradeFixture>();
    for (const chunk of chunks) {
      this.calls.push({ op: "tradesQuery", payload: chunk });
      const rows = await this.rr.request<
        { start: number; end: number },
        GsyTradeRow
      >("tradesQuery", chunk);
      for (const row of rows) {
        const mapped = this.mapTrade(row);
        if (!mapped) continue;
        // UAT-001 — dedupe a trade returned across overlapping windows.
        byId.set(mapped.tradeId, mapped);
      }
    }
    return [...byId.values()];
  }

  async queryMarkets(window: TimeWindow): Promise<MarketInfo[]> {
    const chunks = splitWindowEpoch(window.from, window.until);
    const byId = new Map<string, MarketInfo>();
    for (const chunk of chunks) {
      this.calls.push({ op: "marketsQuery", payload: chunk });
      const rows = await this.rr.request<
        { start: number; end: number },
        GsyMarketRow
      >("marketsQuery", chunk);
      for (const row of rows) {
        const marketId = asId(row.market_id, "market_id");
        byId.set(marketId, {
          marketId,
          communityId: asId(row.community_id, "community_id"),
          deliveryStart: asIso(row.start_time),
          deliveryEnd: asIso(row.end_time),
          mechanism: typeof row.mechanism === "string" ? row.mechanism : "p2p",
        });
      }
    }
    return [...byId.values()];
  }

  async queryClearingResults(marketId: string): Promise<ClearingResult> {
    this.calls.push({ op: "clearingResultsQuery", payload: { marketId } });
    const rows = await this.rr.request<{ marketId: string }, GsyClearingRow>(
      "clearingResultsQuery",
      { marketId },
    );
    const row = rows[0];
    if (!row) {
      throw new EwdsRemoteError("schema", `no clearing for ${marketId}`);
    }
    return {
      marketId: asId(row.market_id ?? marketId, "market_id"),
      numTrades: Math.trunc(asNumber(row.num_trades, 1)),
      tradedQuantityKWh: asNumber(row.traded_quantity, this.valueScale),
    };
  }

  private mapTrade(row: GsyTradeRow): TradeFixture | null {
    // Reject incomplete rows instead of ingesting zeros (Task 4.9 review focus).
    if (
      row.market_id == null ||
      row.energy == null ||
      row.price == null ||
      row.trade_id == null
    ) {
      throw new EwdsRemoteError(
        "schema",
        "trade lacks market_id/energy/price",
      );
    }
    const statusRaw = String(row.status ?? "").toLowerCase();
    if (!this.accepted.has(statusRaw)) return null;
    const status = statusRaw as TradeStatus;
    const fixture: TradeFixture = {
      tradeId: asId(row.trade_id, "trade_id"),
      marketId: asId(row.market_id, "market_id"),
      buyerActorId: asId(row.buyer_id, "buyer_id"),
      sellerActorId: asId(row.seller_id, "seller_id"),
      energyKWh: asNumber(row.energy, this.valueScale),
      pricePerKWhEur: asNumber(row.price, this.valueScale),
      status: status === "settled" ? "settled" : status,
      deliveryStart: asIso(row.start_time),
      deliveryEnd: asIso(row.end_time),
    };
    // A10.3 — optional adjusted unit price from the EWDS Trade payload.
    if (row.adjusted_price != null) {
      fixture.adjustedPricePerKWhEur = asNumber(
        row.adjusted_price,
        this.valueScale,
      );
    }
    return fixture;
  }
}
