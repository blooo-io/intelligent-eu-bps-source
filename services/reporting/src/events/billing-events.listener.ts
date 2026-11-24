import {
  asString,
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ReportingService } from "../reporting/reporting.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

/**
 * INT-271 — project Invoice and Payment events into AC-09 read models (03 §4).
 * Also StatementIssued / StatementStatusChanged / PayoutStatusChanged (REQ-060).
 */
@Injectable()
export class BillingEventsListener implements OnModuleInit {
  private readonly logger = new Logger(BillingEventsListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(ReportingService) private readonly reporting: ReportingService,
    @Inject(IdempotentConsumer)
    private readonly consumer: IdempotentConsumer = new IdempotentConsumer(
      new InMemoryProcessedEventsStore(),
    ),
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe("InvoiceIssued", (p) => this.dedupe(p, () => this.onInvoice(p)));
    await this.bus.subscribe("InvoiceStatusChanged", (p) => this.dedupe(p, () => this.onInvoice(p)));
    await this.bus.subscribe("PaymentStatusChanged", (p) => this.dedupe(p, () => this.onPayment(p)));
    // StatementIssued (WS1 / AC-06) and ParticipantStatementIssued (WS5 alias) share onStatement.
    await this.bus.subscribe("StatementIssued", (p) => this.dedupe(p, () => this.onStatement(p)));
    await this.bus.subscribe("ParticipantStatementIssued", (p) =>
      this.dedupe(p, () => this.onStatement(p)),
    );
    await this.bus.subscribe("StatementStatusChanged", (p) =>
      this.dedupe(p, () => this.onStatementStatus(p)),
    );
    await this.bus.subscribe("PayoutStatusChanged", (p) => this.dedupe(p, () => this.onPayout(p)));
    await this.bus.subscribe("BillingRunCompleted", (p) => this.dedupe(p, () => this.onBillingRun(p)));
    this.logger.log(
      "subscribed to Invoice*/Payment*/Statement*/PayoutStatusChanged/BillingRunCompleted",
    );
  }

  async onInvoice(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = asString(data.invoiceId);
    if (!invoiceId) return;
    const amounts = (data.amounts as Record<string, unknown> | undefined) ?? {};
    this.reporting.projectInvoice({
      invoiceId,
      communityId: env.communityId,
      producerId: asString(data.issuerId ?? data.producerId),
      consumerId: asString(data.recipientId ?? data.consumerId),
      period: asString(data.period, "unknown"),
      currency: asString(data.currency, "EUR"),
      status: asString(data.status, "Open"),
      total: asString(amounts.total ?? data.total, "0.00"),
      tradeIds: Array.isArray(data.tradeIds)
        ? data.tradeIds.map(String)
        : [],
    });
  }

  async onPayment(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const paymentId = asString(data.paymentId);
    const invoiceId = asString(data.invoiceId);
    if (!paymentId || !invoiceId) return;
    // REQ-046 — payerId is the emitted field; participantId mirrors it for KPIs.
    const payerId =
      typeof data.payerId === "string" ? data.payerId : undefined;
    this.reporting.projectPayment({
      paymentId,
      invoiceId,
      communityId: env.communityId,
      amount: asString(data.amount, "0.00"),
      currency: asString(data.currency, "EUR"),
      status: asString(data.status),
      method: typeof data.method === "string" ? data.method : undefined,
      failureCategory:
        typeof data.failureCategory === "string"
          ? data.failureCategory
          : undefined,
      processingTimeMs:
        typeof data.processingTimeMs === "number"
          ? data.processingTimeMs
          : undefined,
      payerId,
      participantId: payerId,
      payeeId: typeof data.payeeId === "string" ? data.payeeId : undefined,
      initiatedAt:
        typeof data.initiatedAt === "string" ? data.initiatedAt : undefined,
      settledAt:
        typeof data.settledAt === "string" ? data.settledAt : undefined,
      feeAmount:
        typeof data.feeAmount === "string" ? data.feeAmount : undefined,
      feeCurrency:
        typeof data.feeCurrency === "string" ? data.feeCurrency : undefined,
    });
  }

  /**
   * Project StatementIssued / ParticipantStatementIssued into StatementProjection.
   * Money fields must already be strings (BR-08); otherwise the event is dropped (Task 5.12).
   */
  async onStatement(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const statementId = asString(data.statementId);
    if (!statementId) return;

    const totalSold = data.totalSold;
    const totalBought = data.totalBought;
    // WS1 StatementIssued uses netBalance; WS5 ParticipantStatementIssued uses netAmount.
    const netAmountRaw = data.netAmount ?? data.netBalance;
    if (
      typeof totalSold !== "string" ||
      typeof totalBought !== "string" ||
      typeof netAmountRaw !== "string"
    ) {
      return;
    }

    const componentsRaw = data.components as Record<string, unknown> | undefined;
    let components = {
      energy: "0.00",
      gridFee: "0.00",
      levies: "0.00",
      vat: "0.00",
    };
    if (componentsRaw) {
      // Components are money fields — drop when any is not a string (BR-08).
      if (
        typeof componentsRaw.energy !== "string" ||
        typeof componentsRaw.gridFee !== "string" ||
        typeof componentsRaw.levies !== "string" ||
        typeof componentsRaw.vat !== "string"
      ) {
        return;
      }
      components = {
        energy: componentsRaw.energy,
        gridFee: componentsRaw.gridFee,
        levies: componentsRaw.levies,
        vat: componentsRaw.vat,
      };
    }

    const communityId =
      (typeof data.communityId === "string" && data.communityId) || env.communityId;
    const invoiceIds = Array.isArray(data.invoiceIds)
      ? data.invoiceIds.filter((id): id is string => typeof id === "string")
      : [];

    // projectStatement is idempotent on statementId (Map put).
    this.reporting.projectStatement({
      statementId,
      participantId: asString(data.participantId),
      communityId,
      period: asString(data.period, "unknown"),
      totalSold,
      totalBought,
      netBalance: netAmountRaw,
      netAmount: netAmountRaw,
      currency: asString(data.currency, "EUR"),
      status: asString(data.status, "Open"),
      energyBoughtKwh:
        typeof data.energyBoughtKwh === "string" ? data.energyBoughtKwh : "0.000",
      energySoldKwh:
        typeof data.energySoldKwh === "string" ? data.energySoldKwh : "0.000",
      components,
      invoiceIds,
    });
  }

  async onStatementStatus(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const statementId = asString(data.statementId);
    if (!statementId) return;
    const prior = this.reporting.getStatement(statementId);
    if (prior) {
      this.reporting.projectStatement({
        ...prior,
        status: asString(data.status, prior.status),
        participantId: asString(data.participantId, prior.participantId),
        period: asString(data.period, prior.period),
        communityId: env.communityId || prior.communityId,
      });
      return;
    }
    const netBalance = asString(data.netBalance ?? data.netAmount, "0.00");
    this.reporting.projectStatement({
      statementId,
      participantId: asString(data.participantId),
      communityId: env.communityId,
      period: asString(data.period, "unknown"),
      totalSold: asString(data.totalSold, "0.00"),
      totalBought: asString(data.totalBought, "0.00"),
      netBalance,
      netAmount: netBalance,
      currency: asString(data.currency, "EUR"),
      status: asString(data.status, "Open"),
      energyBoughtKwh: "0.000",
      energySoldKwh: "0.000",
      components: { energy: "0.00", gridFee: "0.00", levies: "0.00", vat: "0.00" },
      invoiceIds: [],
    });
  }

  async onPayout(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const payoutId = asString(data.payoutId);
    if (!payoutId) return;
    this.reporting.projectPayout({
      payoutId,
      participantId: asString(data.participantId),
      communityId: env.communityId,
      period: asString(data.period, "unknown"),
      amount: asString(data.amount, "0.00"),
      currency: asString(data.currency, "EUR"),
      status: asString(data.status),
    });
  }

  async onBillingRun(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const period = asString(env.data.period);
    if (!env.communityId || !period) return;
    await this.reporting.buildReport({
      communityId: env.communityId,
      period,
    });
  }

  /** INT-339 — dedupe when the envelope carries an eventId. */
  private async dedupe(
    payload: unknown,
    work: () => Promise<void>,
  ): Promise<void> {
    const eventId = asString((payload as { eventId?: string }).eventId);
    if (!eventId) {
      await work();
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      await work();
    });
    if (result.status === "failed") throw result.error;
  }
}

function asEnvelope(payload: unknown): {
  communityId: string;
  data: Record<string, unknown>;
} {
  const envelope = payload as {
    communityId?: string;
    data?: Record<string, unknown>;
  };
  return {
    communityId: asString(envelope.communityId),
    data: envelope.data ?? {},
  };
}
