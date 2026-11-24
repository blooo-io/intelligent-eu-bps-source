/**
 * Contract suite against StripePspAdapter over FakeStripe (WS5 Task 5.4 / INT-424).
 * Live Stripe test mode: set PSP_CONTRACT_LIVE=1 and STRIPE_SECRET_KEY=sk_test_*.
 */

import { describe } from "vitest";
import { StripePspAdapter } from "./stripe-psp.adapter.js";
import type { PspEvent } from "./psp.types.js";
import {
  runPspContractSuite,
  type PspContractHarness,
} from "./testing/psp-contract.suite.js";
import {
  createFakeStripe,
  signFakeStripeEvent,
  type FakeStripe,
} from "./testing/fake-stripe-sdk.js";

const FAKE_CREDS = {
  secretKey: "sk_test_fake_contract",
  webhookSecret: "whsec_fake_test",
  connectWebhookSecret: "whsec_fake_connect",
};

function kindToStripeType(kind: PspEvent["kind"]): string {
  switch (kind) {
    case "payment.succeeded":
      return "payment_intent.succeeded";
    case "payment.failed":
      return "payment_intent.payment_failed";
    case "payment.processing":
      return "payment_intent.processing";
    case "checkout.completed":
      return "checkout.session.completed";
    case "payout.paid":
      return "payout.paid";
    case "payout.failed":
      return "payout.failed";
    case "payout.canceled":
      return "payout.canceled";
    case "account.updated":
      return "account.updated";
    default:
      return "ping";
  }
}

function stripeObjectForEvent(
  e: Omit<PspEvent, "eventId" | "occurredAt"> & { occurredAt?: string },
): Record<string, unknown> {
  switch (e.kind) {
    case "payment.succeeded":
    case "payment.failed":
    case "payment.processing":
      return {
        id: e.pspPaymentRef ?? "pi_ref",
        metadata: e.invoiceId ? { invoiceId: e.invoiceId } : {},
        payment_method_types: e.method ? [e.method] : ["card"],
        ...(e.kind === "payment.failed" && e.failureCategory
          ? {
              last_payment_error: {
                decline_code:
                  e.failureCategory === "bank_account_invalid"
                    ? "account_closed"
                    : e.failureCategory === "card_declined"
                      ? "generic_decline"
                      : e.failureCategory,
              },
            }
          : {}),
      };
    case "checkout.completed":
      return {
        id: e.pspCheckoutRef ?? "cs_ref",
        payment_intent: e.pspPaymentRef ?? "pi_ref",
        metadata: e.invoiceId ? { invoiceId: e.invoiceId } : {},
      };
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled":
      return {
        id: e.pspPayoutRef ?? "po_ref",
        ...(e.kind === "payout.failed"
          ? {
              failure_code:
                e.failureCategory === "bank_account_invalid"
                  ? "account_closed"
                  : e.failureCategory ?? "processing_error",
            }
          : {}),
      };
    case "account.updated":
      return {
        id: e.pspAccountRef ?? "acct_ref",
        metadata: e.participantId ? { participantId: e.participantId } : {},
      };
    default:
      return { id: "obj_ignored" };
  }
}

async function stripeHarness(fake: FakeStripe): Promise<PspContractHarness> {
  const adapter = new StripePspAdapter(
    FAKE_CREDS,
    fake as unknown as import("stripe").default,
  );
  return {
    adapter,
    completeKyc: async (pspAccountRef) => {
      fake.completeKyc(pspAccountRef);
    },
    fundBalance: async (pspAccountRef, amount, currency) => {
      fake.fundBalance(pspAccountRef, amount, currency);
    },
    paymentMethod: async (kind) => {
      switch (kind) {
        case "card_ok":
          return "pm_card_visa";
        case "card_decline":
          return "pm_card_chargeDeclined";
        case "sepa_ok":
          return "pm_sepa_debit";
      }
    },
    signedEvent: (e) => {
      const occurredAt = e.occurredAt ?? new Date().toISOString();
      const created = Math.floor(Date.parse(occurredAt) / 1000);
      const stripeEvent = {
        id: `evt_${created}_${Math.random().toString(36).slice(2, 8)}`,
        object: "event",
        type: kindToStripeType(e.kind),
        created,
        account: e.pspAccountRef,
        data: { object: stripeObjectForEvent({ ...e, occurredAt }) },
      };
      const rawBody = JSON.stringify(stripeEvent);
      return {
        rawBody,
        signature: signFakeStripeEvent(rawBody, FAKE_CREDS.webhookSecret),
      };
    },
  };
}

runPspContractSuite("StripePspAdapter(fake SDK)", async () =>
  stripeHarness(createFakeStripe(FAKE_CREDS.webhookSecret)),
);

describe.skipIf(process.env.PSP_CONTRACT_LIVE !== "1")(
  "StripePspAdapter(live test)",
  () => {
    // Live harness needs STRIPE_SECRET_KEY=sk_test_* and operator fixtures.
    // Fake suite above is the CI gate (BR-12).
    runPspContractSuite("StripePspAdapter(live test)", async () => {
      throw new Error(
        "Live Stripe contract harness requires operator fixtures; use FakeStripe in CI",
      );
    });
  },
);
