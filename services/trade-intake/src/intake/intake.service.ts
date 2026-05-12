import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  createMockSuite,
  type MarketPort,
  type MockSuite,
} from "@intelligent/mocks";
import { OutboxService } from "@intelligent/module-template";
import { TradeStore } from "../domain/store.js";
import type { TradeDto } from "../domain/types.js";
import { formatKWh, formatMoney } from "../money.js";
import {
  PARTY_RESOLVER,
  type PartyResolverPort,
} from "../party/party-resolver.port.js";

const PRODUCER = "AC-04";

/**
 * AC-04 trade intake — settled trades once, delivery from market, status immutable.
 * BR-01, BR-02, BR-11 / INT-104 / INT-117 / INT-118 / INT-119.
 */
@Injectable()
export class IntakeService {
  private suite: MockSuite = createMockSuite("S1");
  private market: MarketPort = this.suite.market;

  constructor(
    @Inject(TradeStore) private readonly store: TradeStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PARTY_RESOLVER) private readonly parties: PartyResolverPort,
  ) {}

  /** Test seam — swap scenario / market port. */
  useSuite(suite: MockSuite): void {
    this.suite = suite;
    this.market = suite.market;
  }

  resetStore(): void {
    this.store.reset();
  }

  getUnbilledTrades(query: {
    until: string;
    communityId?: string;
    consumerId?: string;
    producerId?: string;
  }): TradeDto[] {
    if (!query.until) {
      throw new BadRequestException("until is required");
    }
    const hasCommunity = Boolean(query.communityId);
    const hasPair = Boolean(query.consumerId) && Boolean(query.producerId);
    if (!hasCommunity && !hasPair) {
      throw new BadRequestException(
        "Provide communityId, or both consumerId and producerId",
      );
    }
    return this.store.listUnbilled(query).map((t) => this.toDto(t));
  }

  async refreshIntake(window: {
    from: string;
    to: string;
  }): Promise<{ accepted: true; ingested: number }> {
    if (!window.from || !window.to) {
      throw new BadRequestException("from and to are required");
    }
    if (window.from >= window.to) {
      throw new BadRequestException("from must be before to");
    }
    // P-MKT returns settled trades only (BR-01) overlapping the window.
    const trades = this.market.queryTrades({
      from: window.from,
      until: window.to,
    });
    const markets = this.market.queryMarkets({
      from: window.from,
      until: window.to,
    });
    const marketById = new Map(markets.map((m) => [m.marketId, m]));

    const ingestedIds: string[] = [];
    const communityIds = new Set<string>();

    for (const fixture of trades) {
      // BR-01: only settled; mock already filters, defend in depth.
      if (fixture.status !== "settled") {
        continue;
      }
      // BR-02: delivery period comes from the market (or trade fixture aligned to it).
      const market = marketById.get(fixture.marketId);
      const deliveryStart = market?.deliveryStart ?? fixture.deliveryStart;
      const deliveryEnd = market?.deliveryEnd ?? fixture.deliveryEnd;

      const buyer = await this.parties.resolve(fixture.buyerActorId);
      const seller = await this.parties.resolve(fixture.sellerActorId);
      if (!buyer || !seller) {
        this.store.addAnomaly({
          type: "unknown_party",
          marketId: fixture.marketId,
          details: `tradeId=${fixture.tradeId}`,
        });
        await this.outbox.append({
          aggregateType: "IntakeAnomaly",
          aggregateId: fixture.tradeId,
          type: "IntakeAnomalyDetected",
          producer: PRODUCER,
          communityId: market?.communityId ?? this.suite.scenario.communityId,
          billingMode: "virtual",
          data: {
            type: "unknown_party",
            marketId: fixture.marketId,
            details: `tradeId=${fixture.tradeId}`,
          },
        });
        continue;
      }

      const inserted = this.store.insertOnce({
        tradeId: fixture.tradeId,
        marketId: fixture.marketId,
        buyerActorId: fixture.buyerActorId,
        sellerActorId: fixture.sellerActorId,
        consumerId: buyer.participantId,
        producerId: seller.participantId,
        communityId: buyer.communityId,
        kWh: formatKWh(fixture.energyKWh),
        price: formatMoney(fixture.pricePerKWhEur),
        // BR-11: persist market status as-is; never rewrite later.
        status: fixture.status,
        deliveryStart,
        deliveryEnd,
        billed: false,
      });
      if (inserted) {
        ingestedIds.push(fixture.tradeId);
        communityIds.add(buyer.communityId);
      }
    }

    if (ingestedIds.length > 0) {
      await this.outbox.append({
        aggregateType: "IntakeWindow",
        aggregateId: `${window.from}/${window.to}`,
        type: "TradesIngested",
        producer: PRODUCER,
        communityId: [...communityIds][0] ?? this.suite.scenario.communityId,
        billingMode: "virtual",
        data: {
          window: { from: window.from, to: window.to },
          tradeIds: ingestedIds,
          communityIds: [...communityIds],
        },
      });
    }

    return { accepted: true, ingested: ingestedIds.length };
  }

  async checkIntakeHealth(): Promise<void> {
    // REQ-029 — compare clearing totals to stored settled trades per market.
    const markets = this.market.queryMarkets({
      from: "1970-01-01T00:00:00Z",
      until: "9999-12-31T23:59:59Z",
    });
    for (const market of markets) {
      let clearing;
      try {
        clearing = this.market.queryClearingResults(market.marketId);
      } catch {
        this.store.addAnomaly({
          type: "missing_clearing",
          marketId: market.marketId,
        });
        await this.emitAnomaly("missing_clearing", market.marketId, market.communityId);
        continue;
      }
      const stored = this.store.listByMarket(market.marketId);
      if (stored.length !== clearing.numTrades) {
        this.store.addAnomaly({
          type: "trade_count_mismatch",
          marketId: market.marketId,
          details: `stored=${stored.length} clearing=${clearing.numTrades}`,
        });
        await this.emitAnomaly(
          "trade_count_mismatch",
          market.marketId,
          market.communityId,
          `stored=${stored.length} clearing=${clearing.numTrades}`,
        );
      }
    }
  }

  listAnomalies() {
    return this.store.listAnomalies();
  }

  /**
   * INT-232 — mark trades billed after settlement (also used by unit tests).
   * Does not change market status (BR-11); billed is settlement consumption only.
   */
  markBilled(tradeIds: string[]): void {
    if (!Array.isArray(tradeIds) || tradeIds.length === 0) {
      throw new BadRequestException("tradeIds is required");
    }
    this.store.markBilled(tradeIds);
  }

  /** INT-232 — clear billed flags for operator re-seed. */
  resetBilled(): { cleared: true } {
    this.store.resetBilled();
    return { cleared: true };
  }

  /**
   * INT-232 — ingest the default S1 window so HttpTradeSource has unbilled rows
   * before the first scheduler RefreshIntake (dev/cluster bootstrap).
   */
  async bootstrapS1Window(): Promise<{ accepted: true; ingested: number }> {
    return this.refreshIntake({
      from: "2026-11-01T00:00:00Z",
      to: "2026-11-02T00:00:00Z",
    });
  }

  private toDto(t: {
    tradeId: string;
    marketId: string;
    buyerActorId: string;
    sellerActorId: string;
    consumerId: string | null;
    producerId: string | null;
    kWh: string;
    price: string;
    status: string;
    deliveryStart: string;
    deliveryEnd: string;
  }): TradeDto {
    return {
      tradeId: t.tradeId,
      marketId: t.marketId,
      buyerActorId: t.buyerActorId,
      sellerActorId: t.sellerActorId,
      consumerId: t.consumerId ?? undefined,
      producerId: t.producerId ?? undefined,
      kWh: t.kWh,
      price: t.price,
      status: t.status,
      deliveryStart: t.deliveryStart,
      deliveryEnd: t.deliveryEnd,
    };
  }

  private async emitAnomaly(
    type: string,
    marketId: string,
    communityId: string,
    details?: string,
  ): Promise<void> {
    await this.outbox.append({
      aggregateType: "IntakeAnomaly",
      aggregateId: marketId,
      type: "IntakeAnomalyDetected",
      producer: PRODUCER,
      communityId,
      billingMode: "virtual",
      data: { type, marketId, details },
    });
  }
}
