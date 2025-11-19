import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PublicationStore } from "../domain/store.js";
import type {
  InvoiceProjection,
  OutboundMessage,
  PaymentProjection,
} from "../domain/types.js";
import {
  DATASPACE_PORT,
  type DataSpacePort,
} from "../dataspace/dataspace.port.js";
import { toBillingInvoice, toBillingPayment } from "./mapper.js";

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
      outstandingAmount:
        input.outstanding !== undefined
          ? input.outstanding
          : existing.outstandingAmount,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };
    this.store.putInvoice(next);
    await this.publishInvoice(input.invoiceId);
  }

  async onPaymentStatusChanged(payment: PaymentProjection): Promise<void> {
    this.store.putPayment(payment);
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

  /** RetryPending — AC-14 (REQ-048). */
  async retryPending(): Promise<{ accepted: true; retried: number }> {
    const rows = this.store.listPendingOrFailed();
    let retried = 0;
    for (const row of rows) {
      const result = this.dataspace.publish(row.topic, row.payload);
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
    const purgedGateway = this.dataspace.purgeCache(cutoff);
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
    topic: "billingInvoice" | "billingPayment",
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.store.findOutboundByAggregate(topic, aggregateId);
    const messageId = existing?.messageId ?? randomUUID();
    const result = this.dataspace.publish(topic, payload);
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
