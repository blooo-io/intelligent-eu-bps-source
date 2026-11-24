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
      } as unknown as import("stripe").Stripe.Event),
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
      } as unknown as import("stripe").Stripe.Event),
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
      } as unknown as import("stripe").Stripe.Event),
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
      } as unknown as import("stripe").Stripe.Event),
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

  it("REQ-051 embedded onboarding returns a client secret", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-emb",
      country: "FR",
    });
    const session = await adapter.createOnboardingSession({
      pspAccountRef,
      mode: "embedded",
    });
    expect(session).toMatchObject({
      mode: "embedded",
      pspAccountRef,
    });
    expect(session.clientSecret).toMatch(/\S+/);
  });

  it("pending_verification when KYC docs are under review", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-pend",
      country: "FR",
    });
    // Fake Stripe: clear currently_due, leave pending_verification.
    const acct = await fake.accounts.retrieve(pspAccountRef);
    await fake.accounts.update(pspAccountRef, {
      requirements: {
        currently_due: [],
        pending_verification: ["individual.verification.document"],
        eventually_due: acct.requirements?.eventually_due ?? [],
      },
    } as never);
    expect(await adapter.getAccountStatus(pspAccountRef)).toMatchObject({
      status: "pending_verification",
    });
  });

  it("createPaymentMethodSetup delegates to SetupIntent", async () => {
    const { clientSecret } = await adapter.createPaymentMethodSetup("part-setup");
    expect(clientSecret).toMatch(/\S+/);
  });

  it("attachPaymentMethod accepts unbound test tokens and rejects foreign owners", async () => {
    await expect(
      adapter.attachPaymentMethod("part-a", "pm_card_visa"),
    ).resolves.toMatchObject({ pspPaymentMethodRef: "pm_card_visa" });

    const owned = await fake.paymentMethods.attach("pm_card_visa", {
      customer: (await fake.customers.create({
        metadata: { participantId: "part-b" },
      })).id,
    });
    await expect(
      adapter.attachPaymentMethod("part-a", owned.id),
    ).rejects.toThrow(/payment_method_owned_by_other/);
  });

  it("getPaymentMethodDetails maps card and sepa_debit", async () => {
    await expect(adapter.getPaymentMethodDetails("pm_card_visa")).resolves.toMatchObject({
      type: "card",
      brand: "visa",
    });
    await expect(adapter.getPaymentMethodDetails("pm_sepa_debit")).resolves.toMatchObject({
      type: "sepa_debit",
      brand: "sepa_debit",
    });
  });

  it("refund accepts legacy string and neutral object forms", async () => {
    await expect(adapter.refund("pi_legacy")).resolves.toEqual({ status: "refunded" });
    await expect(
      adapter.refund({ pspPaymentRef: "pi_conn", pspAccountRef: "acct_x" }),
    ).resolves.toEqual({ status: "refunded" });
  });

  it("createDirectCharge fails when the platform PM is not shareable", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-ns",
      country: "FR",
    });
    fake.completeKyc(pspAccountRef);
    const { pspCustomerRef } = await adapter.ensureCustomer({
      participantId: "part-ns",
      pspAccountRef,
    });
    // Non pm_card_* token with no customer → shareablePlatformCard returns null.
    fake.paymentMethods.retrieve = async () =>
      ({
        id: "pm_custom_noshare",
        object: "payment_method",
        type: "card",
        customer: null,
        card: { brand: "visa", last4: "4242" },
      }) as never;
    await expect(
      adapter.createDirectCharge({
        invoiceId: INV1,
        amount: "10.00",
        currency: "EUR",
        pspAccountRef,
        pspCustomerRef,
        pspPaymentMethodRef: "pm_custom_noshare",
        idempotencyKey: "ns:1",
      }),
    ).resolves.toMatchObject({ status: "failed", failureCategory: "other" });
  });

  it.each([
    ["payment_intent.processing", "payment.processing"],
    ["payout.paid", "payout.paid"],
    ["payout.canceled", "payout.canceled"],
    ["account.updated", "account.updated"],
  ] as const)("normalizeStripeEvent maps %s → %s", (type, kind) => {
    const object =
      type === "account.updated"
        ? { id: "acct_1", metadata: { participantId: "p1" } }
        : type.startsWith("payout.")
          ? { id: "po_1" }
          : {
              id: "pi_1",
              metadata: { invoiceId: INV1 },
              payment_method_types: ["card"],
            };
    expect(
      normalizeStripeEvent({
        id: "evt_x",
        type,
        created: 1764064800,
        account: "acct_X",
        data: { object },
      } as unknown as import("stripe").Stripe.Event),
    ).toMatchObject({ kind, eventId: "evt_x" });
  });

  it("normalizeStripeEvent maps payment_intent.payment_failed with decline code", () => {
    expect(
      normalizeStripeEvent({
        id: "evt_fail",
        type: "payment_intent.payment_failed",
        created: 1764064800,
        data: {
          object: {
            id: "pi_f",
            last_payment_error: { decline_code: "insufficient_funds" },
            payment_method_types: ["card"],
          },
        },
      } as unknown as import("stripe").Stripe.Event),
    ).toMatchObject({
      kind: "payment.failed",
      failureCategory: "insufficient_funds",
    });
  });

  it("normalizeStripeEvent maps checkout.session.completed payment_intent object metadata", () => {
    expect(
      normalizeStripeEvent({
        id: "evt_cs2",
        type: "checkout.session.completed",
        created: 1764064800,
        data: {
          object: {
            id: "cs_2",
            payment_intent: {
              id: "pi_nested",
              metadata: { invoiceId: INV1 },
            },
            metadata: {},
          },
        },
      } as unknown as import("stripe").Stripe.Event),
    ).toMatchObject({
      kind: "checkout.completed",
      pspPaymentRef: "pi_nested",
      invoiceId: INV1,
    });
  });

  it("toPspFailureCategory uses substring heuristics", () => {
    expect(toPspFailureCategory("balance_insufficient")).toBe("insufficient_funds");
    expect(toPspFailureCategory("requires_authentication")).toBe(
      "authentication_required",
    );
  });

  it("constructor refuses a missing secret key", () => {
    expect(
      () =>
        new StripePspAdapter({
          secretKey: "",
          webhookSecret: "whsec_x",
          connectWebhookSecret: "",
        }),
    ).toThrow(/requires stripe_secret_key/);
  });

  it("getAvailableBalance returns 0.00 when the currency has no funds", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-bal",
      country: "FR",
    });
    await expect(
      adapter.getAvailableBalance(pspAccountRef, "EUR"),
    ).resolves.toEqual({ amount: "0.00", currency: "EUR" });
  });

  it("createPayout maps paid/in_transit/canceled/failed and rethrows other errors", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-po",
      country: "FR",
    });
    fake.completeKyc(pspAccountRef);
    await adapter.setManualSchedule(pspAccountRef);
    fake.fundBalance(pspAccountRef, "50.00", "EUR");

    const statuses = ["paid", "in_transit", "canceled", "failed", "pending"] as const;
    for (const [i, status] of statuses.entries()) {
      const spy = vi.spyOn(fake.payouts, "create").mockResolvedValueOnce({
        id: `po_${status}`,
        amount: 100,
        currency: "eur",
        status,
        arrival_date: status === "paid" ? 1764064800 : undefined,
        metadata: {},
      } as never);
      await expect(
        adapter.createPayout(pspAccountRef, "1.00", "EUR", `po:${status}:${i}`),
      ).resolves.toMatchObject({
        pspPayoutRef: `po_${status}`,
        status: status === "pending" ? "pending" : status,
      });
      spy.mockRestore();
    }

    vi.spyOn(fake.payouts, "create").mockRejectedValueOnce(
      Object.assign(new Error("boom"), { code: "api_error" }),
    );
    await expect(
      adapter.createPayout(pspAccountRef, "1.00", "EUR", "po:err"),
    ).rejects.toThrow(/boom/);
  });

  it("createCheckoutSession honours saveForFutureUse and rejects a missing url", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "part-cs",
      country: "FR",
    });
    fake.completeKyc(pspAccountRef);
    const { pspCustomerRef } = await adapter.ensureCustomer({
      participantId: "part-cs",
      pspAccountRef,
    });
    await expect(
      adapter.createCheckoutSession({
        invoiceId: INV1,
        amount: "10.00",
        currency: "EUR",
        pspAccountRef,
        pspCustomerRef,
        methods: ["card", "sepa_debit"],
        successUrl: "https://app.invalid/ok",
        cancelUrl: "https://app.invalid/cancel",
        idempotencyKey: "cs:save",
        saveForFutureUse: true,
      }),
    ).resolves.toMatchObject({ checkoutUrl: expect.stringMatching(/^https:\/\//) });

    vi.spyOn(fake.checkout.sessions, "create").mockResolvedValueOnce({
      id: "cs_nourl",
      url: null,
      expires_at: null,
    } as never);
    await expect(
      adapter.createCheckoutSession({
        invoiceId: INV1,
        amount: "10.00",
        currency: "EUR",
        pspAccountRef,
        pspCustomerRef,
        methods: ["card"],
        successUrl: "https://app.invalid/ok",
        cancelUrl: "https://app.invalid/cancel",
        idempotencyKey: "cs:nourl",
        saveForFutureUse: false,
      }),
    ).rejects.toThrow(/missing url/);
  });
});
