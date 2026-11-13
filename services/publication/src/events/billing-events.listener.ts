import {
  asString,
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PublicationService } from "../publication/publication.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

/**
 * INT-271 / INT-376 — publish Invoice and Payment events to EWDS via AC-10
 * (REQ-048, NFR-004). The topic payload is built from the event. Missing
 * identifiers are not replaced with another id, and an EUR invoice carries
 * no exchange rate.
 */

const EWDS_FAILURE = new Set([
  "insufficient_funds",
  "card_declined",
  "authentication_required",
  "mandate_invalid",
  "provider_error",
  "other",
]);

const EWDS_METHOD = new Set(["card", "sepa_debit", "bank_transfer"]);
@Injectable()
export class BillingEventsListener implements OnModuleInit {
  private readonly logger = new Logger(BillingEventsListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(PublicationService) private readonly publication: PublicationService,
    @Inject(IdempotentConsumer)
    private readonly consumer: IdempotentConsumer = new IdempotentConsumer(
      new InMemoryProcessedEventsStore(),
    ),
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe("InvoiceIssued", (p) =>
      this.dedupe(p, () => this.onInvoiceIssued(p)),
    );
    await this.bus.subscribe("InvoiceStatusChanged", (p) =>
      this.dedupe(p, () => this.onInvoiceStatus(p)),
    );
    await this.bus.subscribe("PaymentStatusChanged", (p) =>
      this.dedupe(p, () => this.onPayment(p)),
    );
    this.logger.log("subscribed to Invoice*/PaymentStatusChanged");
  }

  async onInvoiceIssued(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = asString(data.invoiceId);
    if (!invoiceId) return;
    const amounts = (data.amounts as Record<string, unknown> | undefined) ?? {};
    const total = Number(amounts.total ?? data.total ?? 0);
    const energy = Number(amounts.energy ?? 0);
    const vat = Number(amounts.vat ?? 0);
    const issuedAt = env.occurredAt || new Date().toISOString();
    const currency = asString(data.currency, "EUR");
    await this.publication.onInvoiceIssued({
      invoiceId,
      // NFR-004 — billingId is the pair settlement, not a copy of invoiceId.
      billingId: asString(data.settlementId),
      communityId: env.communityId,
      billingMode: env.billingMode,
      settlementType: asString(data.settlementType, "periodic"),
      billingPeriodFrom: asString(data.billingPeriodFrom ?? data.periodFrom),
      billingPeriodUntil: asString(data.billingPeriodUntil ?? data.periodUntil),
      invoiceStatus: asString(data.status, "Open"),
      invoiceIssueDate: issuedAt,
      invoiceIssuedTo: asString(data.recipientId ?? data.consumerId),
      invoiceIssuedBy: asString(data.issuerId ?? data.producerId),
      selfBilling: true,
      invoiceDueDate: asString(data.dueDate),
      totalEnergyKWh: Math.abs(Number(data.totalEnergyKWh ?? 0)),
      totalAmount: total,
      outstandingAmount: total,
      energyAmount: energy,
      taxAmount: vat,
      vatRate: Number(data.vatRate ?? 0),
      carriedForwardAmount: Math.abs(Number(data.carriedForwardAmount ?? 0)),
      currency,
      exchangeRate: exchangeRateOf(currency, data.exchangeRate),
      tradeIds: Array.isArray(data.tradeIds) ? data.tradeIds.map(String) : [],
      paymentIds: [],
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
  }

  async onInvoiceStatus(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = asString(data.invoiceId);
    if (!invoiceId) return;
    try {
      await this.publication.onInvoiceStatusChanged({
        invoiceId,
        status: asString(data.status),
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
    const paymentId = asString(data.paymentId);
    const invoiceId = asString(data.invoiceId);
    if (!paymentId || !invoiceId) return;
    const at = env.occurredAt || new Date().toISOString();
    const amount = Number(data.amount ?? 0);
    const status = asString(data.status);
    await this.publication.onPaymentStatusChanged({
      paymentId,
      invoiceId,
      communityId: env.communityId,
      billingMode: env.billingMode,
      payerId: asString(data.payerId ?? data.participantId),
      payeeId: asString(data.payeeId),
      // The topic date is the success instant. A failed payment has none.
      paymentDate: status === "succeeded" ? at : null,
      paymentAmount: amount,
      currency: asString(data.currency, "EUR"),
      paymentMethod: ewdsMethod(asString(data.method)),
      paymentProvider: "stripe",
      paymentStatus: status,
      failureCategory: ewdsFailure(
        typeof data.failureCategory === "string" ? data.failureCategory : null,
        status,
      ),
      createdAt: at,
      updatedAt: at,
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
  billingMode: "virtual" | "live";
  occurredAt: string;
  data: Record<string, unknown>;
} {
  const envelope = payload as {
    communityId?: string;
    billingMode?: string;
    occurredAt?: string;
    data?: Record<string, unknown>;
  };
  return {
    communityId: asString(envelope.communityId),
    billingMode: envelope.billingMode === "live" ? "live" : "virtual",
    occurredAt: asString(envelope.occurredAt),
    data: envelope.data ?? {},
  };
}

/** NFR-004 — billingPayment.paymentMethod. Anything else is omitted. */
function ewdsMethod(method: string): string | null {
  return EWDS_METHOD.has(method) ? method : null;
}

/**
 * NFR-004 — billingPayment.failureCategory. Internal AC-07 categories
 * (declined, invoice_not_payable, …) are folded onto the topic enum.
 * A payment that did not fail carries no category.
 */
function ewdsFailure(category: string | null, status: string): string | null {
  if (status !== "failed") return null;
  if (category && EWDS_FAILURE.has(category)) return category;
  if (category === "declined") return "card_declined";
  if (category && /mandate|sepa_debit_not_shareable/.test(category)) {
    return "mandate_invalid";
  }
  if (
    category &&
    /invoice_not_payable|amount_mismatch|payment_method_not_attached|provider/.test(
      category,
    )
  ) {
    return "provider_error";
  }
  return "other";
}

/**
 * NFR-004 — null when the invoice is EUR. Otherwise the ECB rate from the
 * settlement. Never a synthetic "identity" source.
 */
function exchangeRateOf(
  currency: string,
  value: unknown,
): {
  sourceCurrency: string;
  rate: number;
  rateDate: string;
  rateSource: "ECB";
} | null {
  if (currency === "EUR" || !value || typeof value !== "object") return null;
  const fx = value as { rate?: unknown; rateDate?: unknown };
  const rate = Number(fx.rate);
  const rateDate = asString(fx.rateDate);
  if (!rateDate || !Number.isFinite(rate) || rate <= 0) return null;
  return { sourceCurrency: "EUR", rate, rateDate, rateSource: "ECB" };
}
