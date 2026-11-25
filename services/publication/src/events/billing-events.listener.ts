import {
  asString,
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { addMoney } from "../publication/mapper.js";
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
    // Task 4.12 / INT-440 — three remaining EWDS record topics.
    await this.bus.subscribe("StatementIssued", (p) =>
      this.dedupe(p, () => this.onStatement(p)),
    );
    await this.bus.subscribe("PayoutStatusChanged", (p) =>
      this.dedupe(p, () => this.onPayout(p)),
    );
    await this.bus.subscribe("KycStatusChanged", (p) =>
      this.dedupe(p, () => this.onKyc(p)),
    );
    this.logger.log(
      "subscribed to Invoice*/Payment/Statement/Payout/KycStatusChanged",
    );
  }

  async onInvoiceIssued(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const invoiceId = asString(data.invoiceId);
    if (!invoiceId) return;
    const amounts = (data.amounts as Record<string, unknown> | undefined) ?? {};
    const total = Number(amounts.total ?? data.total ?? 0);
    const energy = Number(amounts.energy ?? 0);
    // R6 / REQ-004 — gridFeeAmount = gridFee + levy; taxAmount = tax + VAT.
    const gridFeeAmount = addMoney(amounts.gridFee, amounts.levy);
    const taxAmount = addMoney(amounts.tax, amounts.vat);
    const issuedAt = env.occurredAt || new Date().toISOString();
    const currency = asString(data.currency, "EUR");
    await this.publication.onInvoiceIssued({
      invoiceId,
      // NFR-004 — billingId is the consumer statement (pair settlement until WS1 statements land).
      billingId: asString(data.settlementId ?? data.recipientStatementId),
      // Task 4.1 — producer statement; interim fallback until InvoiceIssued carries it (Task 4.12).
      issuerStatementId: asString(
        data.issuerStatementId ?? data.settlementId ?? data.recipientStatementId,
      ),
      communityId: env.communityId,
      billingMode: env.billingMode,
      // REQ-057 — early removed; coerce legacy payloads to final.
      settlementType: settlementTypeOf(asString(data.settlementType, "periodic")),
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
      gridFeeAmount,
      // A10.2 — applied when a non-zero grid fee is published.
      gridFeeStatus:
        asString(data.gridFeeStatus) === "applied" || gridFeeAmount !== 0
          ? "applied"
          : "not_published",
      taxAmount,
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

  /** REQ-059 — StatementIssued → billingStatement. */
  async onStatement(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const billingId = asString(data.billingId ?? data.statementId);
    const actorId = asString(data.actorId ?? data.memberId ?? data.participantId);
    if (!billingId || !actorId) return;
    const at = env.occurredAt || new Date().toISOString();
    const netBalance = Number(data.netBalance ?? 0);
    const balanceDirection = asString(data.balanceDirection);
    await this.publication.onStatementIssued({
      billingId,
      communityId: env.communityId,
      actorId,
      siteId:
        data.siteId === null || data.siteId === undefined
          ? null
          : asString(data.siteId),
      billingMode: env.billingMode,
      billingPeriodFrom: asString(data.billingPeriodFrom ?? data.periodFrom),
      billingPeriodUntil: asString(data.billingPeriodUntil ?? data.periodUntil),
      billingStatus: asString(data.billingStatus ?? data.statementStatus, "Open"),
      overdueDate:
        data.overdueDate === null || data.overdueDate === undefined
          ? null
          : asString(data.overdueDate),
      totalBought: Number(data.totalBought ?? 0),
      totalSold: Number(data.totalSold ?? 0),
      netBalance,
      balanceDirection:
        balanceDirection === "pay" ||
        balanceDirection === "receive" ||
        balanceDirection === "settled"
          ? balanceDirection
          : netBalance < 0
            ? "pay"
            : netBalance > 0
              ? "receive"
              : "settled",
      totalEnergyAmount: Number(data.totalEnergyAmount ?? 0),
      totalGridFeeAmount: Number(data.totalGridFeeAmount ?? 0),
      totalTaxAmount: Number(data.totalTaxAmount ?? 0),
      totalAmountDue: Number(data.totalAmountDue ?? Math.abs(netBalance)),
      totalAmountPaid: Number(data.totalAmountPaid ?? 0),
      outstandingAmount: Number(
        data.outstandingAmount ?? Math.abs(netBalance),
      ),
      currency: asString(data.currency, "EUR"),
      invoiceIds: Array.isArray(data.invoiceIds)
        ? data.invoiceIds.map(String)
        : [],
      payoutIds: Array.isArray(data.payoutIds)
        ? data.payoutIds.map(String)
        : null,
      createdAt: at,
      updatedAt: at,
    });
  }

  /** REQ-060 — PayoutStatusChanged → billingPayout. */
  async onPayout(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const payoutId = asString(data.payoutId);
    const actorId = asString(data.actorId ?? data.participantId);
    if (!payoutId || !actorId) return;
    const at = env.occurredAt || new Date().toISOString();
    await this.publication.onPayoutStatusChanged({
      payoutId,
      actorId,
      communityId: env.communityId,
      billingMode: env.billingMode,
      amount: Number(data.amount ?? 0),
      currency: asString(data.currency, "EUR"),
      payoutStatus: asString(data.payoutStatus ?? data.status, "requested"),
      trigger: asString(data.trigger, "manual") === "auto" ? "auto" : "manual",
      statementIds: Array.isArray(data.statementIds)
        ? data.statementIds.map(String)
        : [],
      arrivalDate:
        data.arrivalDate === null || data.arrivalDate === undefined
          ? null
          : asString(data.arrivalDate),
      failureCategory:
        typeof data.failureCategory === "string" ? data.failureCategory : null,
      createdAt: at,
      updatedAt: at,
    });
  }

  /** A5 — KycStatusChanged → billingKycStatus. */
  async onKyc(payload: unknown): Promise<void> {
    const env = asEnvelope(payload);
    const data = env.data;
    const actorId = asString(data.actorId ?? data.participantId);
    if (!actorId) return;
    const status = asString(data.accountStatus ?? data.status, "Pending");
    const verified =
      data.kycVerified === true ||
      status.toLowerCase() === "active" ||
      asString(data.kycStatus).toLowerCase() === "verified";
    await this.publication.onKycStatusChanged({
      actorId,
      communityId: env.communityId,
      kycVerified: verified,
      accountStatus: verified && status === "Pending" ? "Active" : status,
      verificationKind: asString(data.verificationKind, "connect_account"),
      updatedAt: env.occurredAt || new Date().toISOString(),
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

/** REQ-057 — EWDS enum is periodic|final only. */
function settlementTypeOf(value: string): string {
  if (value === "final" || value === "early") return "final";
  return "periodic";
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
