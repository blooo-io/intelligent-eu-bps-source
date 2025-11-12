import type { PairSettlementInput } from "../domain/types.js";

export type StripeInvoiceCreateResult = {
  stripeInvoiceId: string;
  /** Present once Stripe finalizes — sequential per Connect account (BR-10). */
  legalNumber: string;
  hostedInvoiceUrl: string;
  status: "draft" | "open" | "paid" | "void";
};

/**
 * Narrow Stripe Invoicing port for TD-2 — create invoice on producer Connect account.
 * Full stripe-node client stays behind this port (MIT).
 */
export interface StripeInvoicePort {
  createFromSettlement(
    settlement: PairSettlementInput,
    opts: { stripeAccountId: string; dueDate: string },
  ): Promise<StripeInvoiceCreateResult>;
}

export const STRIPE_INVOICE_PORT = Symbol("STRIPE_INVOICE_PORT");
