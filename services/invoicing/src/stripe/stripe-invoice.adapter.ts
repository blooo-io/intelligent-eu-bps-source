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
    throw new TypeError(`Invalid amount: ${amount}`);
  }
  return Math.round(n * 100);
}

/**
 * Real Stripe test-mode invoice adapter (INT-189 / TD-2 / BR-10).
 * Creates the invoice on the producer Connect account (self-billing) for the
 * consumer's connected-account Customer; AC-07 pays it there (INT-355).
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
    opts: { stripeAccountId: string; stripeCustomerId: string; dueDate: string },
  ): Promise<StripeInvoiceCreateResult> {
    const stripeAccount = opts.stripeAccountId;
    const currency = settlement.currency.toLowerCase();
    // INT-355 / REQ-014 — bill the consumer's reusable Customer on the producer
    // Connect account (owned by AC-07) so AC-07 can pay this very invoice there.
    const customer = opts.stripeCustomerId;

    const tradeSummary = settlement.tradeIds.slice(0, 8).join(", ");
    // TD-2 / REQ-039 — self-billing footer + trade summary on the Stripe PDF.
    // INT-202 — create the draft first, then attach line items by invoice id.
    // Modern Stripe API defaults pending_invoice_items_behavior to "exclude",
    // so pending items created before the invoice never appear on the PDF.
    // INT-355 — charge_automatically with auto_advance=false: Stripe numbers and
    // renders the invoice on finalize but never e-mails a payable link nor
    // charges on its own; AC-07 pays it once with invoices.pay. The due date
    // (REQ-044) stays in AC-06 because Stripe only accepts it for send_invoice.
    const draft = await this.stripe.invoices.create(
      {
        customer,
        collection_method: "charge_automatically",
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        description: `Self-billing energy settlement (${settlement.kWh} kWh). Trades: ${tradeSummary}`,
        footer:
          "Self-billing invoice issued by the platform in the name of the producer (WA-07 / TD-2).",
        custom_fields: [
          // BR-06 / REQ-002 — the invoice shows the ECB rate and its date.
          { name: "ECB rate", value: ecbRate(settlement) },
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
          customer,
          invoice: draft.id,
          amount: energy,
          currency,
          description: `Energy ${settlement.kWh} kWh (EUR to ${settlement.currency} at ${ecbRate(settlement)})`,
        },
        { stripeAccount },
      );
    }
    if (vat > 0) {
      await this.stripe.invoiceItems.create(
        {
          customer,
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
      { auto_advance: false },
      { stripeAccount },
    );

    // BR-10 — Stripe-assigned number is master once finalized.
    // REQ-039 / REQ-042 — expose the PDF rather than the hosted payment page.
    return {
      stripeInvoiceId: finalized.id,
      legalNumber: finalized.number ?? finalized.id,
      hostedInvoiceUrl: finalized.invoice_pdf ?? finalized.hosted_invoice_url ?? "",
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

function ecbRate(settlement: PairSettlementInput): string {
  return settlement.rateDate
    ? `${settlement.rate} (${settlement.rateDate})`
    : settlement.rate;
}
