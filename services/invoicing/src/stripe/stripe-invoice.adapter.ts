import Stripe from "stripe";
import type { PairSettlementInput } from "../domain/types.js";
import type {
  StripeInvoiceCreateResult,
  StripeInvoicePort,
} from "./stripe-invoice.port.js";

export type StripeInvoiceCreds = {
  secretKey: string;
};

function readCreds(env: NodeJS.ProcessEnv = process.env): StripeInvoiceCreds | null {
  const secretKey = env.stripe_secret_key ?? env.STRIPE_SECRET_KEY;
  return secretKey ? { secretKey } : null;
}

function toMinorUnits(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return Math.round(n * 100);
}

/**
 * Real Stripe test-mode invoice adapter (INT-189 / TD-2 / BR-10).
 * Creates the invoice on the producer Connect account (self-billing).
 */
export class StripeInvoiceAdapter implements StripeInvoicePort {
  private readonly stripe: Stripe;

  constructor(creds: StripeInvoiceCreds = readCreds()!) {
    if (!creds?.secretKey) {
      throw new Error("StripeInvoiceAdapter requires stripe_secret_key");
    }
    if (!/_test_/.test(creds.secretKey)) {
      throw new Error("StripeInvoiceAdapter refuses non-test API keys (BR-12)");
    }
    this.stripe = new Stripe(creds.secretKey);
  }

  async createFromSettlement(
    settlement: PairSettlementInput,
    opts: { stripeAccountId: string; dueDate: string },
  ): Promise<StripeInvoiceCreateResult> {
    const stripeAccount = opts.stripeAccountId;
    const currency = settlement.currency.toLowerCase();

    const customer = await this.stripe.customers.create(
      {
        metadata: {
          consumerId: settlement.consumerId,
          settlementId: settlement.settlementId,
        },
      },
      { stripeAccount },
    );

    // A20 — energy + VAT only; no grid-fee lines on P2P invoices.
    const energy = toMinorUnits(settlement.energyAmount);
    const vat = toMinorUnits(settlement.vat);
    if (energy > 0) {
      await this.stripe.invoiceItems.create(
        {
          customer: customer.id,
          amount: energy,
          currency,
          description: `Energy ${settlement.kWh} kWh @ ${settlement.rate}`,
        },
        { stripeAccount },
      );
    }
    if (vat > 0) {
      await this.stripe.invoiceItems.create(
        {
          customer: customer.id,
          amount: vat,
          currency,
          description: "VAT",
        },
        { stripeAccount },
      );
    }

    const due = Date.parse(`${opts.dueDate}T00:00:00.000Z`);
    const daysUntilDue = Number.isFinite(due)
      ? Math.max(1, Math.ceil((due - Date.now()) / 86_400_000))
      : 14;

    const draft = await this.stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: daysUntilDue,
        metadata: {
          settlementId: settlement.settlementId,
          runId: settlement.runId,
          producerId: settlement.producerId,
          consumerId: settlement.consumerId,
        },
      },
      { stripeAccount },
    );

    const finalized = await this.stripe.invoices.finalizeInvoice(
      draft.id,
      {},
      { stripeAccount },
    );

    // BR-10 — Stripe-assigned number is master once finalized.
    return {
      stripeInvoiceId: finalized.id,
      legalNumber: finalized.number ?? finalized.id,
      hostedInvoiceUrl: finalized.hosted_invoice_url ?? "",
      status: mapStatus(finalized.status),
    };
  }
}

function mapStatus(
  status: string | null | undefined,
): "draft" | "open" | "paid" | "void" {
  if (status === "draft" || status === "open" || status === "paid" || status === "void") {
    return status;
  }
  return "open";
}
