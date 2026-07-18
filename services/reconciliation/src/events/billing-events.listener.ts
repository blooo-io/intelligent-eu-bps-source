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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe("InvoiceIssued", (p) => this.onInvoice(p));
    await this.bus.subscribe("InvoiceStatusChanged", (p) => this.onInvoice(p));
    await this.bus.subscribe("PaymentStatusChanged", (p) => this.onPayment(p));
    await this.bus.subscribe("BillingRunCompleted", (p) => this.onBillingRun(p));
    this.logger.log("subscribed to Invoice*/PaymentStatusChanged/BillingRunCompleted");
  }

  async onInvoice(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = String(data.invoiceId ?? "");
    if (!invoiceId) return;
    const amounts = (data.amounts as Record<string, unknown> | undefined) ?? {};
    this.reconciliation.projectInvoice({
      invoiceId,
      communityId: env.communityId,
      currency: String(data.currency ?? "EUR"),
      status: String(data.status ?? "Open"),
      total: String(amounts.total ?? data.total ?? "0.00"),
    });
  }

  async onPayment(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const paymentId = String(data.paymentId ?? "");
    const invoiceId = String(data.invoiceId ?? "");
    if (!paymentId || !invoiceId) return;
    this.reconciliation.projectPayment({
      paymentId,
      invoiceId,
      communityId: env.communityId,
      amount: String(data.amount ?? "0.00"),
      currency: String(data.currency ?? "EUR"),
      status: String(data.status ?? ""),
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
    communityId: String(envelope.communityId ?? ""),
    data: envelope.data ?? {},
  };
}
