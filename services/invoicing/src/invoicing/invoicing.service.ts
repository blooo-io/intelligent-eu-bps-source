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
  /** V1 fixture: producerId → Stripe Connect account id. */
  private connectAccounts = new Map<string, string>();

  constructor(
    @Inject(InvoiceStore) private readonly store: InvoiceStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(STRIPE_INVOICE_PORT) private readonly stripe: StripeInvoicePort,
    @Inject(READINESS_PORT) private readonly readiness: ReadinessPort,
  ) {}

  resetStore(): void {
    this.store.reset();
    this.connectAccounts.clear();
  }

  registerConnectAccount(producerId: string, stripeAccountId: string): void {
    this.connectAccounts.set(producerId, stripeAccountId);
  }

  getInvoice(invoiceId: string): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    currency: string;
    status: InvoiceStatus;
    total: string;
  } {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    return {
      invoiceId: row.invoiceId,
      producerId: row.producerId,
      consumerId: row.consumerId,
      currency: row.currency,
      status: row.status,
      total: row.total,
    };
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

    const stripeAccountId =
      this.connectAccounts.get(settlement.producerId) ??
      `acct_test_${settlement.producerId.replace(/-/g, "").slice(0, 16)}`;

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
      dueDate: due,
      communityId: settlement.communityId,
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
        const next: InvoiceRecord = { ...row, status: "Overdue" };
        this.store.put(next);
        marked += 1;
        await this.outbox.append({
          aggregateType: "Invoice",
          aggregateId: row.invoiceId,
          type: "InvoiceStatusChanged",
          producer: PRODUCER,
          communityId: row.communityId,
          billingMode: "virtual",
          data: {
            invoiceId: row.invoiceId,
            status: "Overdue",
            reason: "past_due",
            outstanding: row.total,
          },
        });
      }
    }
    return { accepted: true, marked };
  }
}
