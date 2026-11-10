import {
  asString,
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ReconciliationService } from "../reconciliation/reconciliation.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

/**
 * INT-271 — project Invoice and Payment events into AC-08 cache (03 §4).
 */
@Injectable()
export class BillingEventsListener implements OnModuleInit {
  private readonly logger = new Logger(BillingEventsListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(ReconciliationService)
    private readonly reconciliation: ReconciliationService,
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
    this.reconciliation.projectInvoice({
      invoiceId,
      communityId: env.communityId,
      currency: asString(data.currency, "EUR"),
      status: asString(data.status, "Open"),
      total: asString(amounts.total ?? data.total, "0.00"),
    });
  }

  async onPayment(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const paymentId = asString(data.paymentId);
    const invoiceId = asString(data.invoiceId);
    if (!paymentId || !invoiceId) return;
    this.reconciliation.projectPayment({
      paymentId,
      invoiceId,
      communityId: env.communityId,
      amount: asString(data.amount, "0.00"),
      currency: asString(data.currency, "EUR"),
      status: asString(data.status),
    });
  }

  async onBillingRun(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    if (!env.communityId) return;
    await this.reconciliation.reconcile({
      scope: "invoice",
      communityId: env.communityId,
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
