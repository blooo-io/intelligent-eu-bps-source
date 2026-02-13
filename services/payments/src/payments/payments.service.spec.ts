/**
 * INT-107 — P-PSP Stripe test mode (BR-12, REQ-014, REQ-040, REQ-051, NFR-015).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { PaymentsStore } from "../domain/store.js";
import { MockPspAdapter } from "../psp/mock-psp.adapter.js";
import { PaymentsService } from "./payments.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const CONSUMER = "11111111-2222-4333-8444-555555555555";

describe("PaymentsService", () => {
  let store: PaymentsStore;
  let outboxStore: InMemoryOutboxStore;
  let psp: MockPspAdapter;
  let service: PaymentsService;

  beforeEach(() => {
    store = new PaymentsStore();
    outboxStore = new InMemoryOutboxStore();
    psp = new MockPspAdapter();
    service = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
    );
  });

  it("creates producer Connect account and onboarding link (REQ-051)", async () => {
    const link = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      returnUrl: "https://app.example/me",
    });
    expect(link.url).toContain("connect.stripe.com");
    expect(store.getAccount(PRODUCER)?.stripeAccountId).toMatch(/^acct_test_/);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");
  });

  it("attaches payment method and emits PaymentAccountStatusChanged (REQ-040)", async () => {
    service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    expect(store.getAccount(CONSUMER)?.paymentMethodId).toBe("pm_card_visa");
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain(
      "PaymentAccountStatusChanged",
    );
  });

  it("pays an invoice to the producer account (REQ-014, BR-12)", async () => {
    service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    const payment = await service.payInvoice({
      invoiceId: "inv-1",
      participantId: CONSUMER,
      communityId: COMMUNITY,
      amount: "2.00",
      currency: "EUR",
      producerStripeAccountId: "acct_test_producer",
    });
    expect(payment.status).toBe("succeeded");
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("PaymentStatusChanged");
  });

  it("categorizes card failures (REQ-016 / S10)", async () => {
    service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_fail_insufficient");
    const payment = await service.payInvoice({
      invoiceId: "inv-2",
      participantId: CONSUMER,
      communityId: COMMUNITY,
      amount: "2.00",
      currency: "EUR",
      producerStripeAccountId: "acct_test_producer",
    });
    expect(payment.status).toBe("failed");
    expect(payment.failureCategory).toBe("insufficient_funds");

    await service.attachPaymentMethod(CONSUMER, "pm_fail_generic");
    const declined = await service.payInvoice({
      invoiceId: "inv-3",
      participantId: CONSUMER,
      communityId: COMMUNITY,
      amount: "2.00",
      currency: "EUR",
      producerStripeAccountId: "acct_test_producer",
    });
    expect(declined.failureCategory).toBe("declined");
  });

  it("rejects webhooks with invalid signature (NFR-015)", async () => {
    await expect(
      service.receiveWebhook("{}", "bad"),
    ).rejects.toThrow(/Invalid webhook signature/);
  });

  it("accepts signed account.updated webhook and verifies KYC", async () => {
    await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      returnUrl: "https://app.example/me",
    });
    const body = JSON.stringify({
      type: "account.updated",
      data: { participantId: PRODUCER },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("returns consumer setup link and rejects pay without method", async () => {
    const link = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
      returnUrl: "https://app.example/me",
    });
    expect(link.url).toContain("checkout.stripe.com");
    await expect(
      service.payInvoice({
        invoiceId: "inv-x",
        participantId: CONSUMER,
        communityId: COMMUNITY,
        amount: "1.00",
        currency: "EUR",
        producerStripeAccountId: "acct_x",
      }),
    ).rejects.toThrow(/payment method/);
  });

  it("refunds via PSP and upgrades pending payment on webhook", async () => {
    expect(await psp.refund("pi_test_x")).toEqual({ status: "refunded" });
    service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    // Force a pending row then succeed via webhook.
    const payment = await service.payInvoice({
      invoiceId: "inv-pending",
      participantId: CONSUMER,
      communityId: COMMUNITY,
      amount: "1.00",
      currency: "EUR",
      producerStripeAccountId: "acct_x",
    });
    const row = store.getPayment(payment.paymentId)!;
    store.putPayment({ ...row, status: "pending" });
    const body = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { stripePaymentId: row.stripePaymentId },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getPayment(payment.paymentId)?.status).toBe("succeeded");
  });

  it("marks payment failed on payment_intent.payment_failed webhook", async () => {
    service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    const payment = await service.payInvoice({
      invoiceId: "inv-fail-hook",
      participantId: CONSUMER,
      communityId: COMMUNITY,
      amount: "1.00",
      currency: "EUR",
      producerStripeAccountId: "acct_x",
    });
    const row = store.getPayment(payment.paymentId)!;
    store.putPayment({ ...row, status: "pending" });
    const body = JSON.stringify({
      type: "payment_intent.payment_failed",
      data: { stripePaymentId: row.stripePaymentId, failureCategory: "declined" },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getPayment(payment.paymentId)?.status).toBe("failed");
  });

  it("rejects webhook without signature and malformed JSON body", async () => {
    await expect(service.receiveWebhook("{}", undefined as unknown as string)).rejects.toThrow(
      /Missing Stripe-Signature/,
    );
    const badJson = "{";
    expect(psp.verifyWebhook(badJson, MockPspAdapter.sign(badJson)).ok).toBe(
      false,
    );
  });

  it("guards unknown participant paths", async () => {
    await expect(
      service.attachPaymentMethod(CONSUMER, "pm_x"),
    ).rejects.toThrow(/Unknown/);
    await expect(service.completeProducerKyc(PRODUCER)).rejects.toThrow(
      /Unknown/,
    );
    expect(store.findByStripePaymentId("missing")).toBeUndefined();
    expect(store.getPayment("missing")).toBeUndefined();
  });
});
