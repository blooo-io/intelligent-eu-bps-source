import { randomUUID } from "node:crypto";
import type { PairSettlementInput } from "../domain/types.js";
import type {
  StripeInvoiceCreateResult,
  StripeInvoicePort,
} from "./stripe-invoice.port.js";

/** Stripe test-mode stand-in for unit tests (no network, no secrets). */
export class MockStripeInvoiceAdapter implements StripeInvoicePort {
  readonly created: StripeInvoiceCreateResult[] = [];
  private seq = new Map<string, number>();

  async createFromSettlement(
    settlement: PairSettlementInput,
    opts: { stripeAccountId: string; dueDate: string },
  ): Promise<StripeInvoiceCreateResult> {
    void opts.dueDate;
    const n = (this.seq.get(opts.stripeAccountId) ?? 0) + 1;
    this.seq.set(opts.stripeAccountId, n);
    // BR-10 — sequential legal number per producer Connect account.
    const result: StripeInvoiceCreateResult = {
      stripeInvoiceId: `in_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      legalNumber: `${opts.stripeAccountId.slice(0, 8).toUpperCase()}-${String(n).padStart(6, "0")}`,
      hostedInvoiceUrl: `https://invoice.stripe.com/i/test_${settlement.settlementId}`,
      status: "open",
    };
    this.created.push(result);
    return result;
  }
}
