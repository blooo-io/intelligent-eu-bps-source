import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PublicationStore } from "../domain/store.js";
import type {
  InvoiceProjection,
  KycProjection,
  OutboundMessage,
  PaymentProjection,
  PayoutProjection,
  StatementProjection,
} from "../domain/types.js";
import type { DataSpaceTopic } from "../domain/types.js";

/** INT-448 — partial UserAccount update (undefined = keep cached value). */
export type UserAccountPatch = {
  actorId: string;
  communityId: string;
  updatedAt: string;
  kycVerified?: boolean;
  accountStatus?: string;
  verificationKind?: string;
  termsVersion?: string | null;
  termsAcceptedAt?: string | null;
  selfBillingMandate?: boolean;
};
import {
  DATASPACE_PORT,
  type DataSpacePort,
} from "../dataspace/dataspace.port.js";
import {
  toBillingInvoice,
  toBillingKycStatus,
  toBillingPayment,
  toBillingPayout,
  toBillingStatement,
} from "./mapper.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * AC-10 publication — map invoice/payment projections to EWDS topics (INT-109).
 * BR-11: never mutates trade status; paid is derived from published records only.
 */
@Injectable()
export class PublicationService {
  constructor(
    @Inject(PublicationStore) private readonly store: PublicationStore,
    @Inject(DATASPACE_PORT) private readonly dataspace: DataSpacePort,
  ) {}

  resetStore(): void {
    this.store.reset();
  }

  /** Test/observability: messages accepted by the P-DS mock. */
  recorded() {
    return this.dataspace.recorded();
  }

  listOutbound(): OutboundMessage[] {
    return this.store.listOutbound();
  }

  /**
   * Project InvoiceIssued into the cache and publish billingInvoice (REQ-048).
   * V1 uses a wide projection until AsyncAPI carries full EWDS fields.
   */
  async onInvoiceIssued(invoice: InvoiceProjection): Promise<void> {
    this.store.putInvoice(invoice);
    await this.publishInvoice(invoice.invoiceId);
  }

  async onInvoiceStatusChanged(input: {
    invoiceId: string;
    status: string;
    outstanding?: number;
    updatedAt?: string;
  }): Promise<void> {
    const existing = this.store.getInvoice(input.invoiceId);
    if (!existing) {
      throw new BadRequestException(`Unknown invoice ${input.invoiceId}`);
    }
    const next: InvoiceProjection = {
      ...existing,
      invoiceStatus: input.status,
      outstandingAmount: input.outstanding ?? existing.outstandingAmount,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };
    this.store.putInvoice(next);
    await this.publishInvoice(input.invoiceId);
  }

  async onPaymentStatusChanged(payment: PaymentProjection): Promise<void> {
    // Ontology Payment.createdAt is immutable — keep the first seen value.
    const existing = this.store.getPayment(payment.paymentId);
    const nextPayment: PaymentProjection = existing
      ? { ...payment, createdAt: existing.createdAt }
      : payment;
    this.store.putPayment(nextPayment);
    const invoice = this.store.getInvoice(payment.invoiceId);
    if (invoice) {
      const paymentIds = invoice.paymentIds.includes(payment.paymentId)
        ? invoice.paymentIds
        : [...invoice.paymentIds, payment.paymentId];
      const paid =
        payment.paymentStatus === "succeeded"
          ? {
              invoiceStatus: "Paid",
              outstandingAmount: 0,
            }
          : {};
      this.store.putInvoice({
        ...invoice,
        paymentIds,
        ...paid,
        updatedAt: payment.updatedAt,
      });
      await this.publishInvoice(invoice.invoiceId);
    }
    await this.publishPayment(payment.paymentId);
  }

  /** REQ-059 — StatementIssued → billingStatement. */
  async onStatementIssued(statement: StatementProjection): Promise<void> {
    await this.publishOrQueue(
      "billingStatement",
      statement.billingId,
      toBillingStatement(statement),
    );
  }

  /** REQ-060 — PayoutStatusChanged → billingPayout. */
  async onPayoutStatusChanged(payout: PayoutProjection): Promise<void> {
    await this.publishOrQueue(
      "billingPayout",
      payout.payoutId,
      toBillingPayout(payout),
    );
  }

  /**
   * A5 / INT-448 — UserAccount snapshot → billingKycStatus.
   * Partial patches merge with the cached projection so KYC-only updates keep
   * T&C fields and T&C-only updates keep KYC fields.
   */
  async onKycStatusChanged(patch: UserAccountPatch): Promise<void> {
    const prev = this.store.getUserAccount(patch.actorId);
    const merged: KycProjection = {
      actorId: patch.actorId,
      communityId: patch.communityId || prev?.communityId || "",
      kycVerified: patch.kycVerified ?? prev?.kycVerified ?? false,
      accountStatus:
        patch.accountStatus ?? prev?.accountStatus ?? "PendingVerification",
      verificationKind:
        patch.verificationKind ?? prev?.verificationKind ?? "connect_account",
      termsVersion:
        patch.termsVersion !== undefined
          ? patch.termsVersion
          : (prev?.termsVersion ?? null),
      termsAcceptedAt:
        patch.termsAcceptedAt !== undefined
          ? patch.termsAcceptedAt
          : (prev?.termsAcceptedAt ?? null),
      selfBillingMandate:
        patch.selfBillingMandate !== undefined
          ? patch.selfBillingMandate
          : (prev?.selfBillingMandate ?? false),
      updatedAt: patch.updatedAt,
    };
    this.store.putUserAccount(merged);
    await this.publishOrQueue(
      "billingKycStatus",
      `${merged.actorId}:${merged.verificationKind}`,
      toBillingKycStatus(merged),
    );
  }

  /** RetryPending — AC-14 (REQ-048). */
  async retryPending(): Promise<{ accepted: true; retried: number }> {
    const rows = this.store.listPendingOrFailed();
    let retried = 0;
    for (const row of rows) {
      const result = await this.dataspace.publish(row.topic, row.payload);
      const now = new Date().toISOString();
      if (result.ok) {
        this.store.putOutbound({
          ...row,
          status: "published",
          publishedAt: now,
          purgeAt: new Date(Date.parse(now) + SEVEN_DAYS_MS).toISOString(),
          updatedAt: now,
        });
      } else {
        this.store.putOutbound({
          ...row,
          status: "failed",
          updatedAt: now,
        });
      }
      retried += 1;
    }
    return { accepted: true, retried };
  }

  /**
   * PurgeCache(before) — retention ≤ 7 days (REQ-053 / UAT-069).
   * Caps `before` so callers cannot keep mock cache beyond 7 days from now.
   */
  async purgeCache(before: string): Promise<{
    accepted: true;
    purgedGateway: number;
    purgedLocal: number;
  }> {
    if (!before || Number.isNaN(Date.parse(before))) {
      throw new BadRequestException("before must be an ISO date-time");
    }
    const maxRetention = Date.now() - SEVEN_DAYS_MS;
    const requested = Date.parse(before);
    const cutoff = new Date(
      Math.min(requested, maxRetention),
    ).toISOString();
    const purgedGateway = await this.dataspace.purgeCache(cutoff);
    const purgedLocal = this.store.purgeLocalBefore(cutoff);
    return { accepted: true, purgedGateway, purgedLocal };
  }

  private async publishInvoice(invoiceId: string): Promise<void> {
    const invoice = this.store.getInvoice(invoiceId);
    if (!invoice) {
      return;
    }
    const payload = toBillingInvoice(invoice);
    await this.publishOrQueue("billingInvoice", invoiceId, payload);
  }

  private async publishPayment(paymentId: string): Promise<void> {
    const payment = this.store.getPayment(paymentId);
    if (!payment) {
      return;
    }
    const payload = toBillingPayment(payment);
    await this.publishOrQueue("billingPayment", paymentId, payload);
  }

  private async publishOrQueue(
    topic: DataSpaceTopic,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.store.findOutboundByAggregate(topic, aggregateId);
    const messageId = existing?.messageId ?? randomUUID();
    const result = await this.dataspace.publish(topic, payload);
    if (result.ok) {
      this.store.putOutbound({
        messageId,
        topic,
        aggregateId,
        payload,
        status: "published",
        publishedAt: now,
        purgeAt: new Date(Date.parse(now) + SEVEN_DAYS_MS).toISOString(),
        updatedAt: now,
      });
    } else {
      this.store.putOutbound({
        messageId,
        topic,
        aggregateId,
        payload,
        status: "failed",
        updatedAt: now,
      });
    }
  }
}
