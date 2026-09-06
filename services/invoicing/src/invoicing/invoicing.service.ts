import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboxService } from "@intelligent/module-template";
import { InvoiceStore } from "../domain/store.js";
import type {
  InvoiceRecord,
  InvoiceStatus,
  PairSettlementInput,
} from "../domain/types.js";
import {
  isLiveStripeInvoiceProvider,
  PAYMENTS_CLIENT,
  type PaymentsClientPort,
} from "../ports/payments-client.port.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "../ports/participants-resolver.port.js";
import {
  READINESS_PORT,
  type ReadinessPort,
} from "../ports/readiness.port.js";
import {
  STRIPE_INVOICE_PORT,
  type StripeInvoicePort,
} from "../stripe/stripe-invoice.port.js";

const PRODUCER = "AC-06";

/**
 * AC-06 — map pair settlement → Stripe invoice (INT-106 / TD-2).
 * BR-09 readiness gate; BR-10 numbering owned by Stripe.
 */
@Injectable()
export class InvoicingService {
  /** Unit-test / mock fixture: producerId → Stripe Connect account id. */
  private readonly connectAccounts = new Map<string, string>();

  constructor(
    @Inject(InvoiceStore) private readonly store: InvoiceStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(STRIPE_INVOICE_PORT) private readonly stripe: StripeInvoicePort,
    @Inject(READINESS_PORT) private readonly readiness: ReadinessPort,
    @Inject(PAYMENTS_CLIENT) private readonly payments: PaymentsClientPort,
    @Inject(PARTICIPANTS_RESOLVER)
    private readonly idpResolver: ParticipantsResolverPort,
  ) {}

  resetStore(): void {
    this.store.reset();
    this.connectAccounts.clear();
  }

  registerConnectAccount(producerId: string, stripeAccountId: string): void {
    this.connectAccounts.set(producerId, stripeAccountId);
  }

  /**
   * INT-228 / TP-7 / INT-231 — Connect id from override → AC-07 → fixture.
   * Never synthesise acct_test_* when talking to live Stripe.
   * When AC-07 reports chargesEnabled=false, throw a retryable signal so the
   * NATS consumer naks until KYC completes.
   */
  private async resolveProducerStripeAccount(
    settlement: PairSettlementInput,
  ): Promise<string> {
    if (settlement.producerStripeAccountId) {
      return settlement.producerStripeAccountId;
    }
    const fromPayments = await this.payments.getPaymentAccount(
      settlement.producerId,
    );
    if (fromPayments?.stripeAccountId) {
      if (fromPayments.chargesEnabled === false) {
        throw new BadRequestException(
          "producer charges_enabled not ready (retry until KYC completes)",
        );
      }
      return fromPayments.stripeAccountId;
    }
    const fromFixture = this.connectAccounts.get(settlement.producerId);
    if (fromFixture) {
      return fromFixture;
    }
    if (isLiveStripeInvoiceProvider()) {
      throw new BadRequestException(
        "producer Connect account required (provision via AC-07; no synthetic acct_test_*)",
      );
    }
    return `acct_test_${settlement.producerId.replaceAll("-", "").slice(0, 16)}`;
  }

  getInvoice(invoiceId: string): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    currency: string;
    status: InvoiceStatus;
    total: string;
    /** INT-196 / UAT-028 — originating trades for operator trace. */
    tradeIds: string[];
    pairSettlementId: string;
    producerStripeAccountId?: string;
    hostedInvoiceUrl?: string;
  } {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    return this.toInternalInvoice(row);
  }

  /** INT-238 — lookup by pair settlement id (NATS smoke / operator poll). */
  getInvoiceBySettlement(settlementId: string): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    currency: string;
    status: InvoiceStatus;
    total: string;
    tradeIds: string[];
    pairSettlementId: string;
    producerStripeAccountId?: string;
    hostedInvoiceUrl?: string;
  } {
    const row = this.store.findBySettlement(settlementId);
    if (!row) {
      throw new NotFoundException(
        `No invoice for settlement ${settlementId}`,
      );
    }
    return this.toInternalInvoice(row);
  }

  private toInternalInvoice(row: InvoiceRecord): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    currency: string;
    status: InvoiceStatus;
    total: string;
    tradeIds: string[];
    pairSettlementId: string;
    producerStripeAccountId?: string;
    hostedInvoiceUrl?: string;
  } {
    return {
      invoiceId: row.invoiceId,
      producerId: row.producerId,
      consumerId: row.consumerId,
      currency: row.currency,
      status: row.status,
      total: row.total,
      tradeIds: row.tradeIds,
      pairSettlementId: row.settlementId,
      ...(row.producerStripeAccountId
        ? { producerStripeAccountId: row.producerStripeAccountId }
        : {}),
      ...(row.hostedInvoiceUrl ? { hostedInvoiceUrl: row.hostedInvoiceUrl } : {}),
    };
  }

  /**
   * INT-236 — JWT `sub` may be Keycloak idpUserId; also keep raw sub so UAT
   * seed invoices (consumerId = IdP sub) remain visible.
   */
  async resolveCallerIds(sub: string): Promise<string[]> {
    const ids = new Set<string>([sub]);
    const resolved = await this.idpResolver.resolveByIdpSub(sub);
    if (resolved?.participantId) {
      ids.add(resolved.participantId);
    }
    return [...ids];
  }

  private isCallerOnInvoice(
    row: InvoiceRecord,
    callerIds: ReadonlySet<string> | string[],
  ): boolean {
    const set =
      callerIds instanceof Set ? callerIds : new Set(callerIds);
    return set.has(row.producerId) || set.has(row.consumerId);
  }

  /** Public list for the authenticated caller (REQ-007 / INT-193 / INT-236). */
  async listInvoicesForParticipant(
    subOrParticipantId: string,
  ): Promise<Record<string, unknown>[]> {
    const callerIds = await this.resolveCallerIds(subOrParticipantId);
    const set = new Set(callerIds);
    return this.store
      .list()
      .filter((row) => this.isCallerOnInvoice(row, set))
      .map((row) => this.toPublicInvoice(row));
  }

  /** Public detail when the caller is producer or consumer (REQ-007). */
  async getPublicInvoiceForParticipant(
    invoiceId: string,
    subOrParticipantId: string,
  ): Promise<Record<string, unknown>> {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    const callerIds = await this.resolveCallerIds(subOrParticipantId);
    if (!this.isCallerOnInvoice(row, callerIds)) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    return this.toPublicInvoice(row);
  }

  /** Hosted PDF / invoice URL (REQ-039). */
  async getDocumentUrlForParticipant(
    invoiceId: string,
    subOrParticipantId: string,
  ): Promise<{ url: string }> {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    const callerIds = await this.resolveCallerIds(subOrParticipantId);
    if (!this.isCallerOnInvoice(row, callerIds)) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    if (!row.hostedInvoiceUrl) {
      throw new NotFoundException(`No document for invoice ${invoiceId}`);
    }
    return { url: row.hostedInvoiceUrl };
  }

  /**
   * TD-2 mapping: create Stripe invoice on producer Connect account from a pair settlement.
   * Idempotent on settlementId.
   */
  async createFromSettlement(
    settlement: PairSettlementInput,
  ): Promise<InvoiceRecord | null> {
    const existing = this.store.findBySettlement(settlement.settlementId);
    if (existing) {
      return existing;
    }

    // Skip zero-amount carry-forward rows (BR-05) — nothing to invoice.
    if (Number(settlement.energyAmount) === 0) {
      return null;
    }

    // BR-09 — hold until producer terms + KYC (CheckReadiness).
    const ready = await this.readiness.check(settlement.producerId);
    if (!ready.ready) {
      throw new BadRequestException(
        ready.reason ?? "producer not ready for self-billing",
      );
    }

    const stripeAccountId = await this.resolveProducerStripeAccount(settlement);

    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + 14);
    const due = dueDate.toISOString().slice(0, 10);

    const stripeInvoice = await this.stripe.createFromSettlement(settlement, {
      stripeAccountId,
      dueDate: due,
    });

    const total = (
      Number(settlement.energyAmount) + Number(settlement.vat)
    ).toFixed(2);

    const invoiceId = randomUUID();
    const record: InvoiceRecord = {
      invoiceId,
      settlementId: settlement.settlementId,
      producerId: settlement.producerId,
      consumerId: settlement.consumerId,
      currency: settlement.currency,
      status: "Open",
      total,
      tradeIds: settlement.tradeIds,
      stripeInvoiceId: stripeInvoice.stripeInvoiceId,
      legalNumber: stripeInvoice.legalNumber,
      hostedInvoiceUrl: stripeInvoice.hostedInvoiceUrl || null,
      energyAmount: settlement.energyAmount,
      vatAmount: settlement.vat,
      producerStripeAccountId: stripeAccountId,
      dueDate: due,
      communityId: settlement.communityId,
      statusAudit: [],
    };
    this.store.put(record);

    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: invoiceId,
      type: "InvoiceIssued",
      producer: PRODUCER,
      communityId: settlement.communityId,
      billingMode: "virtual",
      data: {
        invoiceId,
        issuerId: settlement.producerId,
        recipientId: settlement.consumerId,
        amounts: {
          energy: settlement.energyAmount,
          vat: settlement.vat,
          total,
        },
        currency: settlement.currency,
        tradeIds: settlement.tradeIds,
      },
    });

    return record;
  }

  async markOverdue(asOf: string): Promise<{ accepted: true; marked: number }> {
    if (!asOf) {
      throw new BadRequestException("asOf is required");
    }
    let marked = 0;
    for (const row of this.store.list()) {
      if (row.status === "Open" && row.dueDate < asOf) {
        await this.applyStatus(row, {
          status: "Overdue",
          reason: "past_due",
          actorId: "00000000-0000-4000-8000-000000000001",
          source: "mark_overdue",
        });
        marked += 1;
      }
    }
    return { accepted: true, marked };
  }

  /**
   * Manager manual status change (REQ-044 / UAT-055).
   * Reason is mandatory; actor + reason go to statusAudit and AuditableActionPerformed.
   */
  async setInvoiceStatus(
    invoiceId: string,
    input: { status: InvoiceStatus; reason: string; actorId: string },
  ): Promise<Record<string, unknown>> {
    if (!input.reason?.trim()) {
      throw new BadRequestException("reason is required");
    }
    if (!ALLOWED_STATUSES.has(input.status)) {
      throw new BadRequestException(`unsupported status ${input.status}`);
    }
    const row = this.store.get(invoiceId);
    if (!row) throw new NotFoundException(`Unknown invoice ${invoiceId}`);

    const next = await this.applyStatus(row, {
      status: input.status,
      reason: input.reason.trim(),
      actorId: input.actorId,
      source: "manual",
    });
    return this.toPublicInvoice(next);
  }

  /**
   * Apply a Stripe webhook status into the rebuildable cache (TD-6 / INT-130).
   * Stripe remains master; we store the mapped status locally.
   */
  async applyStripeStatus(input: {
    stripeInvoiceId: string;
    status: InvoiceStatus;
    reason?: string;
  }): Promise<InvoiceRecord | undefined> {
    const row = this.store
      .list()
      .find((r) => r.stripeInvoiceId === input.stripeInvoiceId);
    if (!row) return undefined;
    return this.applyStatus(row, {
      status: input.status,
      reason: input.reason ?? `stripe:${input.status}`,
      actorId: "00000000-0000-4000-8000-000000000002",
      source: "stripe",
    });
  }

  /**
   * INT-270 / INT-130 — PaymentStatusChanged → invoice Paid (BR-11).
   * Idempotent when already Paid; ignores non-succeeded statuses.
   */
  async applyPaymentStatusChanged(input: {
    invoiceId: string;
    paymentId: string;
    status: string;
  }): Promise<InvoiceRecord | undefined> {
    const normalized = input.status.toLowerCase();
    if (normalized !== "succeeded" && normalized !== "paid") {
      return undefined;
    }
    const row = this.store.get(input.invoiceId);
    if (!row) return undefined;
    if (row.status === "Paid") {
      return row;
    }
    return this.applyStatus(row, {
      status: "Paid",
      reason: `payment:${input.paymentId}`,
      actorId: "00000000-0000-4000-8000-000000000002",
      source: "stripe",
    });
  }

  listStatusAudit(invoiceId: string) {
    const row = this.store.get(invoiceId);
    if (!row) throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    return row.statusAudit;
  }

  private async applyStatus(
    row: InvoiceRecord,
    input: {
      status: InvoiceStatus;
      reason: string;
      actorId: string;
      source: "manual" | "stripe" | "mark_overdue";
    },
  ): Promise<InvoiceRecord> {
    const at = new Date().toISOString();
    const next: InvoiceRecord = {
      ...row,
      status: input.status,
      statusAudit: [
        ...row.statusAudit,
        {
          actorId: input.actorId,
          status: input.status,
          reason: input.reason,
          at,
          source: input.source,
        },
      ],
    };
    this.store.put(next);

    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: row.invoiceId,
      type: "InvoiceStatusChanged",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        invoiceId: row.invoiceId,
        status: input.status,
        reason: input.reason,
        outstanding: input.status === "Paid" ? "0.00" : row.total,
      },
    });

    // REQ-044 / REQ-030 — audit trail for AC-12 (identifiers only).
    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: row.invoiceId,
      type: "AuditableActionPerformed",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        actorId: input.actorId,
        action: `invoice.status.${input.source}`,
        target: `invoice:${row.invoiceId}`,
        timestamp: at,
      },
    });

    return next;
  }

  /**
   * REQ-013 / INT-275 — retain invoice rows; emit ErasureCompleted (AC-06).
   */
  async applyErasureRequested(input: {
    requestId: string;
    participantId: string;
  }): Promise<{ result: "completed" | "failed"; invoicesRetained: number }> {
    const invoices = this.store.listByParticipant(input.participantId);
    const communityId = invoices[0]?.communityId ?? "a1000000-0000-4000-8000-000000000001";
    await this.outbox.append({
      aggregateType: "DataSubjectRequest",
      aggregateId: input.requestId,
      type: "ErasureCompleted",
      producer: PRODUCER,
      communityId,
      billingMode: "virtual",
      data: {
        requestId: input.requestId,
        module: "AC-06",
        result: "completed",
      },
    });
    return { result: "completed", invoicesRetained: invoices.length };
  }

  private toPublicInvoice(row: InvoiceRecord): Record<string, unknown> {
    return {
      invoiceId: row.invoiceId,
      legalNumber: row.legalNumber ?? undefined,
      producerId: row.producerId,
      consumerId: row.consumerId,
      currency: row.currency,
      status: row.status,
      dueDate: row.dueDate,
      pairSettlementId: row.settlementId,
      tradeIds: row.tradeIds,
      amounts: {
        energy: row.energyAmount ?? row.total,
        vat: row.vatAmount ?? "0.00",
        total: row.total,
      },
      billingMode: "virtual",
    };
  }
}

const ALLOWED_STATUSES = new Set<InvoiceStatus>([
  "Draft",
  "Open",
  "PartiallyPaid",
  "Paid",
  "Overdue",
  "Void",
  "Disputed",
]);
