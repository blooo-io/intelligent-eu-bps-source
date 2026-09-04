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

    // INT-198 — send_invoice requires a customer email. Identifiers only (NFR-015).
    // INT-228 — include settlement id so each run creates a distinct Stripe Customer
    // visible in the Dashboard (no reused synthetic users outside Stripe).
    const customerEmail = `consumer-${settlement.consumerId.replaceAll("-", "").slice(0, 8)}-${settlement.settlementId.replaceAll("-", "").slice(0, 8)}@example.test`;
    const customer = await this.stripe.customers.create(
      {
        email: customerEmail,
        metadata: {
          consumerId: settlement.consumerId,
          settlementId: settlement.settlementId,
          runId: settlement.runId,
        },
      },
      { stripeAccount },
    );

    const due = Date.parse(`${opts.dueDate}T00:00:00.000Z`);
    const daysUntilDue = Number.isFinite(due)
      ? Math.max(1, Math.ceil((due - Date.now()) / 86_400_000))
      : 14;

    const tradeSummary = settlement.tradeIds.slice(0, 8).join(", ");
    // TD-2 / REQ-039 — self-billing footer + trade summary on the Stripe PDF.
    // INT-202 — create the draft first, then attach line items by invoice id.
    // Modern Stripe API defaults pending_invoice_items_behavior to "exclude",
    // so pending items created before the invoice never appear on the PDF.
    const draft = await this.stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: daysUntilDue,
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        description: `Self-billing energy settlement (${settlement.kWh} kWh). Trades: ${tradeSummary}`,
        footer:
          "Self-billing invoice issued by the platform in the name of the producer (WA-07 / TD-2).",
        custom_fields: [
          { name: "FX rate", value: settlement.rate },
          { name: "Settlement", value: settlement.settlementId.slice(0, 18) },
        ],
        metadata: {
          settlementId: settlement.settlementId,
          runId: settlement.runId,
          producerId: settlement.producerId,
          consumerId: settlement.consumerId,
          tradeIds: tradeSummary,
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
          invoice: draft.id,
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
          invoice: draft.id,
          amount: vat,
          currency,
          description: "VAT",
        },
        { stripeAccount },
      );
    }

    const finalized = await this.stripe.invoices.finalizeInvoice(
      draft.id,
      {},
      { stripeAccount },
    );

    // TD-2 — Stripe emails the consumer for send_invoice (live); sandbox may suppress.
    // Best-effort resend so dashboard email logs capture an attempt when allowed.
    try {
      await this.stripe.invoices.sendInvoice(finalized.id, {}, { stripeAccount });
    } catch {
      // Non-fatal in test mode when automatic emails are disabled.
    }

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
