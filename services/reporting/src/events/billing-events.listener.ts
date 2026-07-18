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
    this.reporting.projectInvoice({
      invoiceId,
      communityId: env.communityId,
      producerId: String(data.issuerId ?? data.producerId ?? ""),
      consumerId: String(data.recipientId ?? data.consumerId ?? ""),
      period: String(data.period ?? "unknown"),
      currency: String(data.currency ?? "EUR"),
      status: String(data.status ?? "Open"),
      total: String(amounts.total ?? data.total ?? "0.00"),
      tradeIds: Array.isArray(data.tradeIds)
        ? data.tradeIds.map(String)
        : [],
    });
  }

  async onPayment(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const paymentId = String(data.paymentId ?? "");
    const invoiceId = String(data.invoiceId ?? "");
    if (!paymentId || !invoiceId) return;
    this.reporting.projectPayment({
      paymentId,
      invoiceId,
      communityId: env.communityId,
      amount: String(data.amount ?? "0.00"),
      currency: String(data.currency ?? "EUR"),
      status: String(data.status ?? ""),
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
    const period = String(env.data.period ?? "");
    if (!env.communityId || !period) return;
    await this.reporting.buildReport({
      communityId: env.communityId,
      period,
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
