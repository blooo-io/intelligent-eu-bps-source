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
    await this.bus.subscribe("BillingRunCompleted", (p) => this.dedupe(p, () => this.onBillingRun(p)));
    this.logger.log("subscribed to Invoice*/PaymentStatusChanged/BillingRunCompleted");
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
      participantId:
        typeof data.participantId === "string" ? data.participantId : undefined,
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
