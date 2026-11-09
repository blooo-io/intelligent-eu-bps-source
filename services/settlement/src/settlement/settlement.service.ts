import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createMockSuite, type FxPort } from "@intelligent/mocks";
import {
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import { type Dec, ZERO, compareAbs, dec, mul, roundCentDec, toNumber } from "../domain/decimal.js";
import { formatKWh, formatMoney, formatRate } from "../domain/money.js";
import { buildInvoiceTradeLines } from "../domain/trade-lines.js";
import { decidePairBalance } from "../domain/carry.js";
import {
  businessDayOnOrBefore,
  isPeriod,
  lastBusinessDayOf,
  lastClosedPeriod,
  parsePeriod,
  periodContaining,
  previousBusinessDay,
  untilOf,
} from "../domain/period.js";
import {
  type CanonicalPairBucket,
  canonicalPair,
  netCanonicalPairs,
} from "../domain/netting.js";
import type { UnbilledTrade } from "../domain/types.js";
import { SettlementStore, type SettlementWrite } from "../domain/store.js";
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
/** ECB publishes no rate on TARGET holidays; look back a few business days. */
const RATE_LOOKBACK_DAYS = 5;

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
    billingPeriod: "monthly",
  };
  private clock: () => Date = () => new Date();
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();

  /** INT-356 — Postgres transaction around the run when DATABASE_URL is set. */
  useTransaction(tx: RecordingTransaction<SettlementWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

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

  /** Test helper — override the wall clock used for periods and rate dates. */
  useClock(now: () => Date): this {
    this.clock = now;
    return this;
  }

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
    const now = this.clock();
    await this.refreshBillingContext(communityId);
    const unbilled = await this.trades.getUnbilled(communityId, now.toISOString());
    const { rate: fxRate } = await this.resolveFxRate(businessDayOnOrBefore(now));
    const rows: Array<{ counterpartId: string; amount: string; currency: string }> =
      [];

    for (const pair of this.collectPairs(communityId, unbilled, {
      onlyParticipantId: participantId,
      includeCarriedOnly: () => true,
    })) {
      const decision = decidePairBalance(
        {
          low: pair.low,
          high: pair.high,
          energy: mul(pair.netEur, fxRate),
          carriedIn: this.store.getCarry(pair.low, pair.high),
        },
        ZERO,
        true,
      );
      if (decision.consumerId !== participantId || decision.gross === ZERO) continue;
      rows.push({
        counterpartId: decision.producerId,
        amount: formatMoney(decision.gross),
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
    /** INT-273 — offboard final: settle pairs involving this participant. */
    onlyParticipantId?: string;
  }): Promise<{ runId: string }> {
    return this.tx.run(() => this.performStartRun(input));
  }

  private async performStartRun(input: {
    communityId: string;
    type: BillingRunType;
    period?: string;
    onlyPair?: { consumerId: string; producerId: string };
    onlyParticipantId?: string;
  }): Promise<{ runId: string }> {
    if (!input.communityId) {
      throw new BadRequestException("communityId is required");
    }
    if (!["periodic", "early", "final"].includes(input.type)) {
      throw new BadRequestException("invalid run type");
    }
    if (input.period !== undefined && !isPeriod(input.period)) {
      throw new BadRequestException("period must be YYYY-MM or YYYY-Qn");
    }

    const now = this.clock();
    // INT-272 — AC-03 settings + AC-13 VAT/FX before threshold / VAT / FX (BR-05..07).
    await this.refreshBillingContext(input.communityId);

    // BR-12 — V1 communities are virtual; settlement still computes amounts.
    if (this.context.billingMode === "live") {
      throw new BadRequestException("V1 billingMode must be virtual");
    }

    // REQ-006 — without a period, a periodic run closes the last elapsed period
    // of the community calendar, once (AC-14 cron and its retries).
    const closing = input.type === "periodic" && input.period === undefined;
    const cadence = this.context.billingPeriod;
    const period =
      input.period ??
      (input.type === "periodic"
        ? lastClosedPeriod(now, cadence)
        : periodContaining(now, cadence));
    if (closing) {
      const closed = this.store.findPeriodicRun(input.communityId, period);
      if (closed) return { runId: closed.runId };
    }
    const bounds = parsePeriod(period);
    // A periodic run covers trades delivered up to the end of the period; early
    // and final runs settle everything delivered so far.
    const until = input.type === "periodic" ? untilOf(bounds) : now.toISOString();
    const unbilled = await this.trades.getUnbilled(input.communityId, until);
    const forceInvoice = input.type === "early" || input.type === "final";
    const threshold = dec(this.context.threshold);
    const pairs = this.collectPairs(input.communityId, unbilled, {
      onlyPair: input.onlyPair,
      onlyParticipantId: input.onlyParticipantId,
      // BR-05 — a carried-only pair is settled when the run forces invoicing
      // or when the threshold no longer holds it back.
      includeCarriedOnly: (carry) =>
        forceInvoice || compareAbs(carry, threshold) >= 0,
    });
    const runId = randomUUID();
    const settlementIds: string[] = [];
    // INT-278 / BR-13 / REQ-005 — correction appends a new version; never overwrite.
    const version = this.store.nextRunVersion(input.communityId, period);
    // BR-06 — ECB rate of the last business day of the period, or of the
    // settlement date for early and final runs.
    const { rate: fxRate, rateDate } = await this.resolveFxRate(
      input.type === "periodic" ? lastBusinessDayOf(bounds) : businessDayOnOrBefore(now),
    );

    for (const pair of pairs) {
      const decision = decidePairBalance(
        {
          low: pair.low,
          high: pair.high,
          energy: mul(pair.netEur, fxRate),
          carriedIn: this.store.getCarry(pair.low, pair.high),
        },
        threshold,
        forceInvoice,
      );

      // BR-07 — VAT at community rate (default 0).
      const vat = roundCentDec(mul(decision.invoiced, dec(this.context.vatRate)));
      const settlementId = randomUUID();
      const record: PairSettlementRecord = {
        settlementId,
        runId,
        consumerId: decision.consumerId,
        producerId: decision.producerId,
        tradeIds: pair.tradeIds,
        lines: buildInvoiceTradeLines({
          trades: pair.trades,
          direction: decision.direction,
          fxRate,
          invoiced: decision.invoiced,
          carriedInOriented: decision.carriedInOriented,
        }),
        kWh: formatKWh(pair.netKWh),
        energyAmount: formatMoney(decision.invoiced),
        vat: formatMoney(vat),
        currency: this.context.currency,
        rate: formatRate(fxRate),
        rateDate,
        carriedForwardIn: formatMoney(decision.carriedInOriented),
        carriedForwardOut: formatMoney(decision.carriedOutOriented),
        netAmount: toNumber(decision.invoiced),
        version,
      };
      // BR-13 — append only.
      this.store.appendSettlement(record);
      this.store.setCarry(
        input.communityId,
        pair.low,
        pair.high,
        decision.carriedOutCanonical,
      );
      settlementIds.push(settlementId);

      // INT-232 — mark billed on any TradeSourcePort (fixture or AC-04 HTTP).
      if (pair.tradeIds.length > 0) {
        await this.trades.markBilled(pair.tradeIds);
      }
    }

    this.store.appendRun({
      runId,
      communityId: input.communityId,
      period,
      type: input.type,
      version,
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
        version,
        counts: { pairs: settlementIds.length },
      },
    });

    return { runId };
  }

  /**
   * BR-04 / BR-05 — period buckets plus carried-only pairs of the community,
   * scoped to one pair (early settlement) or one participant (final / balances).
   */
  private collectPairs(
    communityId: string,
    unbilled: UnbilledTrade[],
    scope: {
      onlyPair?: { consumerId: string; producerId: string };
      onlyParticipantId?: string;
      includeCarriedOnly: (carry: Dec) => boolean;
    },
  ): CanonicalPairBucket[] {
    const pairs = new Map<string, CanonicalPairBucket>();
    for (const bucket of netCanonicalPairs(unbilled)) {
      pairs.set(`${bucket.low}|${bucket.high}`, bucket);
    }
    for (const carry of this.store.listCarries(communityId)) {
      const key = `${carry.low}|${carry.high}`;
      if (!pairs.has(key) && scope.includeCarriedOnly(carry.amount)) {
        pairs.set(key, {
          low: carry.low,
          high: carry.high,
          tradeIds: [],
          trades: [],
          netKWh: ZERO,
          netEur: ZERO,
        });
      }
    }
    const onlyKey = scope.onlyPair
      ? canonicalPair(scope.onlyPair.consumerId, scope.onlyPair.producerId).join("|")
      : undefined;
    return [...pairs.entries()]
      .filter(([key]) => onlyKey === undefined || key === onlyKey)
      .filter(
        ([, p]) =>
          scope.onlyParticipantId === undefined ||
          p.low === scope.onlyParticipantId ||
          p.high === scope.onlyParticipantId,
      )
      .map(([, p]) => p);
  }

  /**
   * INT-272 — load threshold / currency / mode from AC-03 and VAT from AC-13
   * when HTTP ports are wired; otherwise keep fixture context (CI / unit tests).
   */
  private async refreshBillingContext(
    communityId: string,
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
  private async resolveFxRate(
    rateDate: string,
  ): Promise<{ rate: Dec; rateDate: string }> {
    if (this.context.currency === "EUR") {
      return { rate: dec(1), rateDate };
    }
    let date = rateDate;
    for (let attempt = 1; ; attempt++) {
      try {
        return { rate: dec(await this.fetchChfRate(date)), rateDate: date };
      } catch (error) {
        if (attempt >= RATE_LOOKBACK_DAYS) throw error;
        date = previousBusinessDay(date);
      }
    }
  }

  private async fetchChfRate(date: string): Promise<number> {
    if (this.referenceData) {
      return this.referenceData.getRate("CHF", date);
    }
    return this.fx.getRate("CHF", date).rate;
  }
}
