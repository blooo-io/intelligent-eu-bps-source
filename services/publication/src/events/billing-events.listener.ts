import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PublicationService } from "../publication/publication.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

/**
 * INT-271 — publish Invoice and Payment events to EWDS via AC-10 (REQ-048).
 * Thin AsyncAPI payloads are widened with V1 defaults until events carry full EWDS fields.
 */
@Injectable()
export class BillingEventsListener implements OnModuleInit {
  private readonly logger = new Logger(BillingEventsListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(PublicationService) private readonly publication: PublicationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe("InvoiceIssued", (p) => this.onInvoiceIssued(p));
    await this.bus.subscribe("InvoiceStatusChanged", (p) =>
      this.onInvoiceStatus(p),
    );
    await this.bus.subscribe("PaymentStatusChanged", (p) => this.onPayment(p));
    this.logger.log("subscribed to Invoice*/PaymentStatusChanged");
  }

  async onInvoiceIssued(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = String(data.invoiceId ?? "");
    if (!invoiceId) return;
    const amounts = (data.amounts as Record<string, unknown> | undefined) ?? {};
    const total = Number(amounts.total ?? data.total ?? 0);
    const energy = Number(amounts.energy ?? 0);
    const vat = Number(amounts.vat ?? 0);
    const now = new Date().toISOString();
    await this.publication.onInvoiceIssued({
      invoiceId,
      billingId: invoiceId,
      communityId: env.communityId,
      billingMode: env.billingMode,
      settlementType: "periodic",
      billingPeriodFrom: String(data.periodFrom ?? now.slice(0, 10)),
      billingPeriodUntil: String(data.periodUntil ?? now.slice(0, 10)),
      invoiceStatus: String(data.status ?? "Open"),
      invoiceIssueDate: now.slice(0, 10),
      invoiceIssuedTo: String(data.recipientId ?? data.consumerId ?? ""),
      invoiceIssuedBy: String(data.issuerId ?? data.producerId ?? ""),
      selfBilling: true,
      invoiceDueDate: String(data.dueDate ?? now.slice(0, 10)),
      totalEnergyKWh: 0,
      totalAmount: total,
      outstandingAmount: total,
      energyAmount: energy,
      taxAmount: vat,
      vatRate: 0,
      carriedForwardAmount: 0,
      currency: String(data.currency ?? "EUR"),
      exchangeRate: {
        sourceCurrency: String(data.currency ?? "EUR"),
        rate: 1,
        rateDate: now.slice(0, 10),
        rateSource: "identity",
      },
      tradeIds: Array.isArray(data.tradeIds) ? data.tradeIds.map(String) : [],
      paymentIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  async onInvoiceStatus(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = String(data.invoiceId ?? "");
    if (!invoiceId) return;
    try {
      await this.publication.onInvoiceStatusChanged({
        invoiceId,
        status: String(data.status ?? ""),
        outstanding:
          data.outstanding !== undefined
            ? Number(data.outstanding)
            : undefined,
      });
    } catch (err) {
      // Status change before Issued — ignore until Issued lands (at-least-once).
      this.logger.debug(
        `InvoiceStatusChanged ${invoiceId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onPayment(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const paymentId = String(data.paymentId ?? "");
    const invoiceId = String(data.invoiceId ?? "");
    if (!paymentId || !invoiceId) return;
    const now = new Date().toISOString();
    const amount = Number(data.amount ?? 0);
    await this.publication.onPaymentStatusChanged({
      paymentId,
      invoiceId,
      communityId: env.communityId,
      billingMode: env.billingMode,
      payerId: String(data.participantId ?? ""),
      payeeId: "",
      paymentDate: now.slice(0, 10),
      paymentAmount: amount,
      currency: String(data.currency ?? "EUR"),
      paymentMethod: String(data.method ?? "card"),
      paymentProvider: "stripe",
      paymentStatus: String(data.status ?? ""),
      failureCategory:
        typeof data.failureCategory === "string" ? data.failureCategory : null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function asEnvelope(payload: unknown): {
  communityId: string;
  billingMode: "virtual" | "live";
  data: Record<string, unknown>;
} {
  const envelope = payload as {
    communityId?: string;
    billingMode?: string;
    data?: Record<string, unknown>;
  };
  return {
    communityId: String(envelope.communityId ?? ""),
    billingMode: envelope.billingMode === "live" ? "live" : "virtual",
    data: envelope.data ?? {},
  };
}
