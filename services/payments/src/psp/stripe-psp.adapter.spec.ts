/**
 * Stripe-specific mapping cases (WS5 Task 5.5 / INT-424).
 * Shared Collect/KYC/Payout behaviour lives in stripe-psp.contract.spec.ts.
 */

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeStripeEvent,
  StripePspAdapter,
  toPspFailureCategory,
} from "./stripe-psp.adapter.js";
import { PspError } from "./psp.types.js";
import {
  createFakeStripe,
  type FakeStripe,
} from "./testing/fake-stripe-sdk.js";

const INV1 = "22222222-2222-4222-8222-222222222222";

const CREDS = {
  secretKey: "sk_test_adapter_spec",
  webhookSecret: "whsec_platform",
  connectWebhookSecret: "whsec_connect",
};

describe("StripePspAdapter mapping (INT-424)", () => {
  let fake: FakeStripe;
  let adapter: StripePspAdapter;

  beforeEach(() => {
    fake = createFakeStripe(CREDS.webhookSecret);
    adapter = new StripePspAdapter(
      CREDS,
      fake as unknown as import("stripe").default,
    );
  });

  it("refuses non-test API keys (BR-12)", () => {
    expect(
      () =>
        new StripePspAdapter({
          secretKey: "sk_live_forbidden",
          webhookSecret: "whsec_x",
          connectWebhookSecret: "",
        }),
    ).toThrow(/non-test/);
  });

  it.each([
    ["generic_decline", "card_declined"],
    ["do_not_honor", "card_declined"],
    ["insufficient_funds", "insufficient_funds"],
    ["authentication_required", "authentication_required"],
    ["debit_not_authorized", "mandate_invalid"],
    ["account_closed", "bank_account_invalid"],
    ["no_account", "bank_account_invalid"],
    ["processing_error", "provider_error"],
    ["weird_code", "other"],
  ] as const)(
    "UAT-016 REQ-016 maps Stripe code %s to %s",
    (code, cat) => {
      expect(toPspFailureCategory(code)).toBe(cat);
    },
  );

  it("UAT-057 payment_intent.succeeded on a Connect account becomes payment.succeeded with PSP time", () => {
    expect(
      normalizeStripeEvent({
        id: "evt_1",
        type: "payment_intent.succeeded",
        created: 1764064800,
        account: "acct_X",
        data: {
          object: {
            id: "pi_1",
            metadata: { invoiceId: INV1 },
            payment_method_types: ["sepa_debit"],
          },
        },
      } as import("stripe").Stripe.Event),
    ).toEqual({
      eventId: "evt_1",
      kind: "payment.succeeded",
      occurredAt: "2025-11-25T10:00:00.000Z",
      pspAccountRef: "acct_X",
      pspPaymentRef: "pi_1",
      invoiceId: INV1,
      method: "sepa_debit",
    });
  });

  it("REQ-014 checkout.session.completed carries the payment ref", () => {
    expect(
      normalizeStripeEvent({
        id: "evt_cs",
        type: "checkout.session.completed",
        created: 1764064800,
        account: "acct_X",
        data: {
          object: {
            id: "cs_1",
            payment_intent: "pi_2",
            metadata: { invoiceId: INV1 },
          },
        },
      } as import("stripe").Stripe.Event),
    ).toEqual({
      eventId: "evt_cs",
      kind: "checkout.completed",
      occurredAt: "2025-11-25T10:00:00.000Z",
      pspAccountRef: "acct_X",
      pspCheckoutRef: "cs_1",
      pspPaymentRef: "pi_2",
      invoiceId: INV1,
    });
  });

  it("UAT-016 payout.failed maps failure_code", () => {
    expect(
      normalizeStripeEvent({
        id: "evt_po",
        type: "payout.failed",
        created: 1764064800,
        account: "acct_X",
        data: {
          object: {
            id: "po_1",
            failure_code: "account_closed",
          },
        },
      } as import("stripe").Stripe.Event),
    ).toEqual({
      eventId: "evt_po",
      kind: "payout.failed",
      occurredAt: "2025-11-25T10:00:00.000Z",
      pspAccountRef: "acct_X",
      pspPayoutRef: "po_1",
      failureCategory: "bank_account_invalid",
    });
  });

  it("maps ignored for unknown Stripe event types", () => {
    expect(
      normalizeStripeEvent({
        id: "evt_ping",
        type: "ping",
        created: 1764064800,
        data: { object: { hello: "world" } },
      } as import("stripe").Stripe.Event),
    ).toMatchObject({
      eventId: "evt_ping",
      kind: "ignored",
      occurredAt: "2025-11-25T10:00:00.000Z",
    });
  });

  it("REQ-015 setManualSchedule sets interval manual on the connected account", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-1",
      country: "FR",
    });
    const update = vi.spyOn(fake.accounts, "update");
    await adapter.setManualSchedule(pspAccountRef);
    expect(update).toHaveBeenCalledWith(pspAccountRef, {
      settings: { payouts: { schedule: { interval: "manual" } } },
    });
  });

  it("REQ-015 balance_insufficient becomes PspError insufficient_balance", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-2",
      country: "FR",
    });
    fake.completeKyc(pspAccountRef);
    await adapter.setManualSchedule(pspAccountRef);
    await expect(
      adapter.createPayout(pspAccountRef, "999.00", "EUR", "po:big"),
    ).rejects.toBeInstanceOf(PspError);
    await expect(
      adapter.createPayout(pspAccountRef, "999.00", "EUR", "po:big2"),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  it("createDirectCharge refuses platform sepa_debit with mandate_invalid", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-3",
      country: "FR",
    });
    fake.completeKyc(pspAccountRef);
    const { pspCustomerRef } = await adapter.ensureCustomer({
      participantId: "part-3",
      pspAccountRef,
    });
    await expect(
      adapter.createDirectCharge({
        invoiceId: INV1,
        amount: "10.00",
        currency: "EUR",
        pspAccountRef,
        pspCustomerRef,
        pspPaymentMethodRef: "pm_sepa_debit",
        idempotencyKey: "sepa:1",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCategory: "mandate_invalid",
      method: "sepa_debit",
    });
  });

  it("verifyEvent rejects bad signatures and normalises signed events", () => {
    expect(adapter.verifyEvent("{}", "bad")).toEqual({ ok: false });
    const rawBody = JSON.stringify({
      id: "evt_ok",
      type: "payment_intent.succeeded",
      created: 1764064800,
      account: "acct_X",
      data: {
        object: {
          id: "pi_ok",
          metadata: { invoiceId: INV1 },
          payment_method_types: ["card"],
        },
      },
    });
    const signature = `t=1,v1=${createHmac("sha256", CREDS.webhookSecret).update(rawBody).digest("hex")}`;
    expect(adapter.verifyEvent(rawBody, signature)).toMatchObject({
      ok: true,
      event: {
        kind: "payment.succeeded",
        pspPaymentRef: "pi_ok",
        invoiceId: INV1,
      },
    });
  });
});
