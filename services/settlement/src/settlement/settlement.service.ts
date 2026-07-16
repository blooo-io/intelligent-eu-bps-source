import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createMockSuite, type FxPort } from "@intelligent/mocks";
import { OutboxService } from "@intelligent/module-template";
import {
  formatKWh,
  formatMoney,
  formatRate,
  roundCent,
} from "../domain/money.js";
import { netPairs } from "../domain/netting.js";
import { SettlementStore } from "../domain/store.js";
import type {
  BillingRunType,
  CommunityBillingContext,
  PairSettlementRecord,
} from "../domain/types.js";
import {
  COMMUNITY_SETTINGS_PORT,
  type CommunitySettingsPort,
} from "../ports/community-settings.port.js";
import {
  FixtureTradeSource,
} from "../ports/fixture-trade-source.js";
import {
  REFERENCE_DATA_PORT,
  type ReferenceDataPort,
} from "../ports/reference-data.port.js";
import {
  TRADE_SOURCE,
  type TradeSourcePort,
} from "../ports/trade-source.port.js";

const PRODUCER = "AC-05";

/**
 * AC-05 settlement engine — BR-03..BR-08, BR-12, BR-13 / INT-105.
 */
@Injectable()
export class SettlementService {
  private fx: FxPort = createMockSuite("S8").fx;
  /** Fixture / test defaults; overwritten from AC-03/AC-13 when ports are wired (INT-272). */
  private context: CommunityBillingContext = {
    communityId: createMockSuite("S1").scenario.communityId,
    currency: "EUR",
    threshold: 5,
    vatRate: 0,
    billingMode: "virtual",
  };

  constructor(
    @Inject(SettlementStore) private readonly store: SettlementStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(TRADE_SOURCE) private readonly trades: TradeSourcePort,
    @Optional()
    @Inject(COMMUNITY_SETTINGS_PORT)
    private readonly settings: CommunitySettingsPort | null = null,
    @Optional()
    @Inject(REFERENCE_DATA_PORT)
    private readonly referenceData: ReferenceDataPort | null = null,
  ) {}

  resetStore(): void {
    this.store.reset();
    if (this.trades instanceof FixtureTradeSource) {
      this.trades.useScenario("S1");
      this.context.communityId = this.trades.communityId();
      this.context.currency = this.trades.currency();
    }
  }

  /**
   * INT-228 / INT-232 — clear billed set (fixture store or AC-04 reset-billed)
   * so seed runs can re-settle the same trades.
   */
  async resetFixtureBilled(): Promise<{ cleared: true }> {
    if (!this.trades.resetBilled) {
      throw new BadRequestException("trade source does not support resetBilled");
    }
    await this.trades.resetBilled();
    return { cleared: true };
  }

  useFixtureScenario(
    scenarioId: "S1" | "S2" | "S3" | "S8",
    opts?: Partial<CommunityBillingContext>,
  ): void {
    if (this.trades instanceof FixtureTradeSource) {
      this.trades.useScenario(scenarioId === "S8" ? "S1" : scenarioId);
      this.context.communityId = this.trades.communityId();
      this.context.currency =
        opts?.currency ?? this.trades.currency();
    }
    if (scenarioId === "S8" || opts?.currency === "CHF") {
      this.fx = createMockSuite("S8").fx;
      this.context.currency = "CHF";
    }
    Object.assign(this.context, opts);
  }

  getPairSettlement(settlementId: string): PairSettlementRecord {
    const row = this.store.getSettlement(settlementId);
    if (!row) {
      throw new NotFoundException(`Unknown settlement ${settlementId}`);
    }
    return row;
  }

  /** INT-196 / UAT-028 — expose run + settlementIds for invoice bridging. */
  getBillingRun(runId: string) {
    const row = this.store.getRun(runId);
    if (!row) {
      throw new NotFoundException(`Unknown billing run ${runId}`);
    }
    return {
      runId: row.runId,
      communityId: row.communityId,
      period: row.period,
      type: row.type,
      version: row.version,
      settlementIds: [...row.settlementIds],
    };
  }

  /** Public BillingRun shape (status completed after sync run). */
  getPublicBillingRun(runId: string) {
    const row = this.getBillingRun(runId);
    return {
      runId: row.runId,
      communityId: row.communityId,
      period: row.period,
      type: row.type,
      status: "completed",
      version: row.version,
    };
  }

  /**
   * INT-211 / REQ-057 — unbilled amounts for the caller as consumer (one row per producer).
   * Empty list when nothing is outstanding (never 404).
   */
  async listBalancesForParticipant(
    participantId: string,
    communityId: string,
  ): Promise<
    Array<{ counterpartId: string; amount: string; currency: string }>
  > {
    if (!communityId) {
      return [];
    }
    const period = new Date().toISOString().slice(0, 7);
    await this.refreshBillingContext(communityId, period);
    const until = `${period}-28T23:59:59Z`;
    const unbilled = await this.trades.getUnbilled(communityId, until);
    const pairs = netPairs(unbilled).filter((p) => p.consumerId === participantId);
    const fxRate = await this.resolveFxRate(period);
    const rows: Array<{ counterpartId: string; amount: string; currency: string }> =
      [];

    for (const pair of pairs) {
      const carriedIn = this.store.getCarry(pair.consumerId, pair.producerId);
      const energyCommunity = roundCent(pair.netEur * fxRate);
      const gross = roundCent(energyCommunity + carriedIn);
      if (gross === 0) continue;
      rows.push({
        counterpartId: pair.producerId,
        amount: formatMoney(gross),
        currency: this.context.currency,
      });
    }

    return rows;
  }

  /** INT-211 / BR-05 — early settle one consumer→producer pair. */
  async createEarlySettlement(input: {
    consumerId: string;
    producerId: string;
    communityId: string;
  }) {
    if (!input.producerId) {
      throw new BadRequestException("producerId is required");
    }
    if (!input.communityId) {
      throw new BadRequestException("communityId is required");
    }
    const { runId } = await this.startRun({
      communityId: input.communityId,
      type: "early",
      onlyPair: {
        consumerId: input.consumerId,
        producerId: input.producerId,
      },
    });
    return this.getPublicBillingRun(runId);
  }

  /** Manager/operator community billing run (public). */
  async startPublicRun(input: {
    communityId: string;
    type: BillingRunType;
    period?: string;
  }) {
    const { runId } = await this.startRun(input);
    return this.getPublicBillingRun(runId);
  }

  async startRun(input: {
    communityId: string;
    type: BillingRunType;
    period?: string;
    /** When set, only settle this consumer→producer pair (early settle-now). */
    onlyPair?: { consumerId: string; producerId: string };
  }): Promise<{ runId: string }> {
    if (!input.communityId) {
      throw new BadRequestException("communityId is required");
    }
    if (!["periodic", "early", "final"].includes(input.type)) {
      throw new BadRequestException("invalid run type");
    }
    if (input.type === "periodic" && !input.period) {
      throw new BadRequestException("period is required for periodic runs");
    }

    const period = input.period ?? new Date().toISOString().slice(0, 7);
    // INT-272 — AC-03 settings + AC-13 VAT/FX before threshold / VAT / FX (BR-05..07).
    await this.refreshBillingContext(input.communityId, period);

    // BR-12 — V1 communities are virtual; settlement still computes amounts.
    if (this.context.billingMode === "live") {
      throw new BadRequestException("V1 billingMode must be virtual");
    }

    const until = `${period}-28T23:59:59Z`;
    const unbilled = await this.trades.getUnbilled(input.communityId, until);
    let pairs = netPairs(unbilled);
    if (input.onlyPair) {
      pairs = pairs.filter(
        (p) =>
          p.consumerId === input.onlyPair!.consumerId &&
          p.producerId === input.onlyPair!.producerId,
      );
    }
    const runId = randomUUID();
    const settlementIds: string[] = [];
    const fxRate = await this.resolveFxRate(period);

    for (const pair of pairs) {
      const carriedIn = this.store.getCarry(pair.consumerId, pair.producerId);
      const energyEur = pair.netEur;
      const energyCommunity = roundCent(energyEur * fxRate);
      const gross = roundCent(energyCommunity + carriedIn);

      // BR-05 — below threshold → carry forward (unless early/final).
      const forceInvoice =
        input.type === "early" || input.type === "final" || gross === 0;
      const belowThreshold = Math.abs(gross) < this.context.threshold;

      let energyAmount = 0;
      let carriedForwardOut = 0;
      if (!forceInvoice && belowThreshold && gross !== 0) {
        carriedForwardOut = gross;
        energyAmount = 0;
      } else {
        energyAmount = gross;
        carriedForwardOut = 0;
      }

      // BR-07 — VAT at community rate (default 0).
      const vat = roundCent(energyAmount * this.context.vatRate);
      const settlementId = randomUUID();
      const record: PairSettlementRecord = {
        settlementId,
        runId,
        consumerId: pair.consumerId,
        producerId: pair.producerId,
        tradeIds: pair.tradeIds,
        kWh: formatKWh(Math.abs(pair.netKWh)),
        energyAmount: formatMoney(energyAmount),
        vat: formatMoney(vat),
        currency: this.context.currency,
        rate: formatRate(fxRate),
        carriedForwardIn: formatMoney(carriedIn),
        carriedForwardOut: formatMoney(carriedForwardOut),
        netAmount: energyAmount,
        version: 1,
      };
      // BR-13 — append only.
      this.store.appendSettlement(record);
      this.store.setCarry(pair.consumerId, pair.producerId, carriedForwardOut);
      settlementIds.push(settlementId);

      // INT-232 — mark billed on any TradeSourcePort (fixture or AC-04 HTTP).
      await this.trades.markBilled(pair.tradeIds);
    }

    this.store.appendRun({
      runId,
      communityId: input.communityId,
      period,
      type: input.type,
      version: 1,
      settlementIds,
    });

    await this.outbox.append({
      aggregateType: "BillingRun",
      aggregateId: runId,
      type: "SettlementCompleted",
      producer: PRODUCER,
      communityId: input.communityId,
      billingMode: "virtual",
      data: { runId, pairSettlementIds: settlementIds },
    });
    await this.outbox.append({
      aggregateType: "BillingRun",
      aggregateId: runId,
      type: "BillingRunCompleted",
      producer: PRODUCER,
      communityId: input.communityId,
      billingMode: "virtual",
      data: {
        runId,
        period,
        version: 1,
        counts: { pairs: settlementIds.length },
      },
    });

    return { runId };
  }

  /**
   * INT-272 — load threshold / currency / mode from AC-03 and VAT from AC-13
   * when HTTP ports are wired; otherwise keep fixture context (CI / unit tests).
   */
  private async refreshBillingContext(
    communityId: string,
    _period: string,
  ): Promise<void> {
    if (this.settings) {
      const remote = await this.settings.get(communityId);
      this.context = { communityId, ...remote };
    } else {
      this.context.communityId = communityId;
    }
    if (this.referenceData) {
      // BR-07 — AC-13 is master of community VAT when available.
      this.context.vatRate = await this.referenceData.getVatRate(communityId);
    }
  }

  /** BR-06 — EUR identity rate; CHF from AC-13 when wired, else ECB fixture (S8). */
  private async resolveFxRate(period: string): Promise<number> {
    if (this.context.currency === "EUR") {
      return 1;
    }
    const rateDate = `${period}-28`;
    if (this.referenceData) {
      try {
        return await this.referenceData.getRate("CHF", rateDate);
      } catch {
        return await this.referenceData.getRate("CHF", "2026-11-30");
      }
    }
    try {
      return this.fx.getRate("CHF", rateDate).rate;
    } catch {
      return this.fx.getRate("CHF", "2026-11-30").rate;
    }
  }
}
