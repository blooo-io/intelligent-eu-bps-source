/**
 * INT-107 — P-PSP Stripe test mode (BR-12, REQ-014, REQ-040, REQ-051, NFR-015).
 */
import "reflect-metadata";
import { BadGatewayException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
import type { Clock } from "../domain/clock.js";
import { PaymentsStore } from "../domain/store.js";
import { MockPspAdapter } from "../psp/mock-psp.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import { InMemoryConnectedCustomersStore } from "../ports/connected-customers.store.js";
import { InMemoryInvoiceLookup } from "../ports/invoice-lookup.port.js";
import { InMemoryPaymentAccountsStore } from "../ports/payment-accounts.store.js";
import { NoopParticipantsNotifier } from "../ports/participants-notifier.port.js";
import { NoopParticipantsResolver } from "../ports/participants-resolver.port.js";
import { PaymentsService } from "./payments.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const CONSUMER = "11111111-2222-4333-8444-555555555555";

class TestClock implements Clock {
  private current = new Date("2026-11-24T09:00:00.000Z");
  set(iso: string): void {
    this.current = new Date(iso);
  }
  now(): Date {
    return new Date(this.current);
  }
}

describe("PaymentsService", () => {
  let store: PaymentsStore;
  let outboxStore: InMemoryOutboxStore;
  let psp: MockPspAdapter;
  let invoices: InMemoryInvoiceLookup;
  let accountsStore: InMemoryPaymentAccountsStore;
  let pspErase: MockPspEraseAdapter;
  let clock: TestClock;
  let service: PaymentsService;

  beforeEach(() => {
    clock = new TestClock();
    store = new PaymentsStore();
    outboxStore = new InMemoryOutboxStore();
    psp = new MockPspAdapter();
    pspErase = new MockPspEraseAdapter();
    invoices = new InMemoryInvoiceLookup();
    accountsStore = new InMemoryPaymentAccountsStore();
    service = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
  });

  it("INT-338 — getPaymentStatus returns the stored row and 404s otherwise", () => {
    store.putPayment({
      paymentId: "pay-1",
      invoiceId: "inv-1",
      participantId: CONSUMER,
      amount: "10.00",
      currency: "EUR",
      status: "succeeded",
      pspPaymentRef: "pi_1",
      communityId: COMMUNITY,
    });
    expect(service.getPaymentStatus("pay-1")).toEqual({
      paymentId: "pay-1",
      invoiceId: "inv-1",
      status: "succeeded",
    });
    expect(() => service.getPaymentStatus("missing")).toThrow(/Unknown payment/);
  });

  it("provisions a fresh producer Connect account each run (INT-228)", async () => {
    const first = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    expect(first.pspAccountRef).toMatch(/^acct_test_/);
    const second = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    expect(second.pspAccountRef).toMatch(/^acct_test_/);
    expect(second.pspAccountRef).not.toBe(first.pspAccountRef);
    const got = await service.getPaymentAccount(PRODUCER);
    expect(got.pspAccountRef).toBe(second.pspAccountRef);

    const reused = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: false,
    });
    expect(reused.pspAccountRef).toBe(second.pspAccountRef);
  });

  it("provisions consumer SetupIntent path (INT-228)", async () => {
    const row = await service.provisionPaymentAccount({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
      fresh: true,
    });
    expect(row.participantId).toBe(CONSUMER);
    expect(row.pspAccountRef).toBeNull();
  });

  it("creates a Stripe-collected account and returns an embedded Account Session (INT-362 / REQ-051)", async () => {
    const session = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    expect(session.mode).toBe("embedded");
    expect(session.status).toBe("requirements_due");
    expect(session.clientSecret).toMatch(/^accs_secret_test_acct_test_/);
    expect(session.pspAccountRef).toMatch(/^acct_test_/);
    expect(store.getAccount(PRODUCER)?.pspAccountRef).toBe(session.pspAccountRef);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");

    // A second Start reuses the account and issues a fresh Account Session.
    const again = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    expect(again.pspAccountRef).toBe(session.pspAccountRef);
    expect(again.clientSecret).toBeTruthy();
  });

  it("Start after the embedded component completes verifies KYC without a session (INT-362)", async () => {
    const started = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    psp.completeOnboarding(started.pspAccountRef!);
    const done = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    expect(done).toMatchObject({ mode: "embedded", status: "complete" });
    expect(done.clientSecret).toBeUndefined();
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("account.updated during embedded onboarding does not verify KYC until Stripe reports nothing due (INT-362)", async () => {
    const started = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    const midway = JSON.stringify({
      id: "evt_test_account_updated_midway",
      type: "account.updated",
      data: { participantId: PRODUCER, pspAccountRef: started.pspAccountRef },
    });
    await service.receiveWebhook(midway, MockPspAdapter.sign(midway));
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");

    psp.completeOnboarding(started.pspAccountRef!);
    const done = JSON.stringify({
      id: "evt_test_account_updated_done",
      type: "account.updated",
      data: { participantId: PRODUCER, pspAccountRef: started.pspAccountRef },
    });
    await service.receiveWebhook(done, MockPspAdapter.sign(done));
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("reuses existing Connect account on startOnboarding (INT-191)", async () => {
    await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "127.0.0.1",
      submission: {
        accountToken: "ct_existing",
        country: "FR",
        businessType: "individual",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        representative: { firstName: "A", lastName: "B", email: "a@b.co" },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    const session = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    expect(session.pspAccountRef).toMatch(/^acct_test_/);
    expect(session.status).toBe("complete");
  });

  it("updates existing account on subsequent KYC submit (INT-191)", async () => {
    await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "127.0.0.1",
      submission: {
        accountToken: "ct_first",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    // Force remaining due then clear via update path.
    const id = store.getAccount(PRODUCER)!.pspAccountRef!;
    psp.dueByAccount.set(id, ["business_profile.mcc"]);
    store.putAccount({ ...store.getAccount(PRODUCER)!, kycStatus: "pending" });
    const session = await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "127.0.0.1",
      submission: { businessProfileMcc: "5734" },
    });
    expect(session.status).toBe("complete");
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("defaults country to FR when omitted (INT-191)", async () => {
    const createSpy = vi.spyOn(psp, "createProducerAccount");
    await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "127.0.0.1",
      submission: {
        accountToken: "ct_fr_default",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        externalAccount: {
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ country: "FR", accountToken: "ct_fr_default" }),
    );
    expect(store.getAccount(PRODUCER)?.pspAccountRef).toMatch(/^acct_test_/);
  });

  it("creates Custom account with token on first KYC submit (INT-191 / UAT-051)", async () => {
    await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    const session = await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "203.0.113.9",
      submission: {
        accountToken: "ct_test_client",
        country: "FR",
        businessType: "individual",
        businessProfileUrl: "https://producer.example",
        businessProfileMcc: "5734",
        representative: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
        },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    expect(session.status).toBe("complete");
    expect(store.getAccount(PRODUCER)?.pspAccountRef).toMatch(/^acct_test_/);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
    expect(psp.tokens).toEqual([]);
  });

  it("rejects consumer requirements submit and mints server token when missing (INT-191)", async () => {
    await expect(
      service.submitOnboardingRequirements({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
        clientIp: "127.0.0.1",
        submission: { tosAccepted: true },
      }),
    ).rejects.toThrow(/Consumers use payment-method/);

    const session = await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
      clientIp: "127.0.0.1",
      submission: {
        businessType: "individual",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        representative: {
          firstName: "A",
          lastName: "B",
          email: "a@b.co",
          address: { country: "FR" },
        },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    expect(session.status).toBe("complete");
    expect(store.getAccount(PRODUCER)?.pspAccountRef).toMatch(/^acct_test_/);
    expect(psp.tokens).toHaveLength(1);
  });

  it("attaches payment method and emits PaymentAccountStatusChanged (REQ-040)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBe("pm_card_visa");
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain(
      "PaymentAccountStatusChanged",
    );
  });

  it("startOnboarding with existing PM re-notifies Ready (INT-255)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    const before = (await outboxStore.list()).length;
    const session = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(session).toEqual({ mode: "elements", status: "complete" });
    const after = await outboxStore.list();
    expect(after.length).toBeGreaterThan(before);
    expect(after.map((e) => e.event.type)).toContain(
      "PaymentAccountStatusChanged",
    );
  });

  it("startOnboarding fails when Ready notify fails and a card is saved (INT-390 / ANO-006)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    const failing = {
      applyPaymentAccountStatus: vi.fn(async () => {
        throw new Error("participants payment-account-status failed with 503");
      }),
    };
    const svc = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      failing,
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    await expect(
      svc.startOnboarding({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
      }),
    ).rejects.toThrow(/failed with 503/);
    expect(failing.applyPaymentAccountStatus).toHaveBeenCalled();
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBe("pm_card_visa");
  });

  it("getMyPaymentAccount returns brand/last4 for Ready consumer (INT-255)", async () => {
    expect(await service.getMyPaymentAccount(CONSUMER)).toEqual({
      status: "none",
    });
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await expect(service.getMyPaymentAccount(CONSUMER)).resolves.toEqual({
      status: "complete",
      method: "card",
      brand: "visa",
      last4: "4242",
    });
  });

  it("INT-276: SEPA payment method surfaces method=sepa_debit on pay (REQ-014)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_sepa_debit");
    await expect(service.getMyPaymentAccount(CONSUMER)).resolves.toMatchObject({
      status: "complete",
      method: "sepa_debit",
      brand: "sepa_debit",
      last4: "3000",
    });
    invoices.put({
      invoiceId: "inv-sepa-1",
      pspInvoiceRef: "in_inv-sepa-1",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "12.00",
      producerPspAccountRef: "acct_test_producer",
    });
    // B7 — a saved SEPA mandate cannot be charged on the producer account: hosted checkout needs a returnUrl.
    const charge = vi.spyOn(psp, "createDirectCharge");
    await expect(
      service.payInvoice({
        invoiceId: "inv-sepa-1",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      }),
    ).rejects.toThrow(/returnUrl required/);
    expect(charge).not.toHaveBeenCalled();
  });

  it("getMyPaymentAccount returns dashboardUrl for Ready producer (INT-255)", async () => {
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    const summary = await service.getMyPaymentAccount(PRODUCER);
    expect(summary.status).toBe("complete");
    expect(summary.pspAccountRef).toMatch(/^acct_test_/);
    expect(summary.dashboardUrl).toContain(summary.pspAccountRef!);
  });

  it("INT-340 — a payment method cannot be attached to a second participant", async () => {
    const other = "22222222-3333-4444-8555-666666666666";
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.ensureParticipant({
      participantId: other,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await expect(service.attachPaymentMethod(other, "pm_card_visa")).rejects.toThrow(
      /another participant/,
    );
  });

  it("INT-340 — a void invoice is not payable", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-void",
      pspInvoiceRef: "in_void",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Void",
      total: "2.00",
      producerPspAccountRef: "acct_test_producer",
    });
    await expect(
      service.payInvoice({
        invoiceId: "inv-void",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      }),
    ).rejects.toThrow(/not payable/);
  });

  it("pays an invoice to the producer account (REQ-014, BR-12)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-1",
      pspInvoiceRef: "in_inv-1",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerPspAccountRef: "acct_test_producer",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-1",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("succeeded");
    expect(payment.amount).toBe("2.00");
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("PaymentStatusChanged");
  });

  it("categorizes card failures (REQ-016 / S10)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_fail_insufficient");
    invoices.put({
      invoiceId: "inv-2",
      pspInvoiceRef: "in_inv-2",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerPspAccountRef: "acct_test_producer",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-2",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("failed");
    expect(payment.failureCategory).toBe("card_declined");

    await service.attachPaymentMethod(CONSUMER, "pm_fail_generic");
    invoices.put({
      invoiceId: "inv-3",
      pspInvoiceRef: "in_inv-3",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerPspAccountRef: "acct_test_producer",
    });
    const declined = await service.payInvoice({
      invoiceId: "inv-3",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(declined.failureCategory).toBe("card_declined");
  });

  it("rejects webhooks with invalid signature (NFR-015)", async () => {
    await expect(
      service.receiveWebhook("{}", "bad"),
    ).rejects.toThrow(/Invalid webhook signature/);
  });

  it("accepts signed account.updated webhook and verifies KYC", async () => {
    await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "127.0.0.1",
      submission: {
        accountToken: "ct_hook",
        country: "FR",
        businessType: "individual",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        representative: { firstName: "A", lastName: "B", email: "a@b.co" },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    // Reset verified → pending so webhook can flip KYC again.
    const row = store.getAccount(PRODUCER)!;
    store.putAccount({ ...row, kycStatus: "pending" });
    const body = JSON.stringify({
      id: "evt_test_account_updated_1",
      type: "account.updated",
      data: { participantId: PRODUCER },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("is idempotent on Stripe event.id replay (INT-326 / 04 §7)", async () => {
    await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      clientIp: "127.0.0.1",
      submission: {
        accountToken: "ct_hook_dup",
        country: "FR",
        businessType: "individual",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        representative: { firstName: "A", lastName: "B", email: "a@b.co" },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    const row = store.getAccount(PRODUCER)!;
    store.putAccount({ ...row, kycStatus: "pending" });
    const body = JSON.stringify({
      id: "evt_test_dup_account",
      type: "account.updated",
      data: { participantId: PRODUCER },
    });
    const sig = MockPspAdapter.sign(body);
    await service.receiveWebhook(body, sig);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
    store.putAccount({
      ...store.getAccount(PRODUCER)!,
      kycStatus: "pending",
    });
    await service.receiveWebhook(body, sig);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");
    expect(service.getWebhookDuplicateCount()).toBe(1);
  });

  it("returns consumer SetupIntent elements session; pay on an unknown invoice is not found (INT-193)", async () => {
    const session = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(session.mode).toBe("elements");
    expect(session.clientSecret).toMatch(/^seti_test_/);
    await expect(
      service.payInvoice({
        invoiceId: "inv-x",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      }),
    ).rejects.toThrow(/Unknown invoice inv-x/);
  });

  it("refunds via PSP and upgrades pending payment on webhook", async () => {
    expect(await psp.refund("pi_test_x")).toEqual({ status: "refunded" });
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-pending",
      pspInvoiceRef: "in_inv-pending",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "1.00",
      producerPspAccountRef: "acct_x",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-pending",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    const row = store.getPayment(payment.paymentId)!;
    store.putPayment({ ...row, status: "pending" });
    const body = JSON.stringify({
      id: "evt_test_pi_succeeded_1",
      type: "payment_intent.succeeded",
      data: { pspPaymentRef: row.pspPaymentRef },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getPayment(payment.paymentId)?.status).toBe("succeeded");
  });

  it("marks payment failed on payment_intent.payment_failed webhook", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-fail-hook",
      pspInvoiceRef: "in_inv-fail-hook",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "1.00",
      producerPspAccountRef: "acct_x",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-fail-hook",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    const row = store.getPayment(payment.paymentId)!;
    store.putPayment({ ...row, status: "pending" });
    const body = JSON.stringify({
      id: "evt_test_pi_failed_1",
      type: "payment_intent.payment_failed",
      data: { pspPaymentRef: row.pspPaymentRef, failureCategory: "declined" },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getPayment(payment.paymentId)?.status).toBe("failed");
  });

  describe("UAT-014 / UAT-015 REQ-014 direct charge on the producer Connect account (INT-355)", () => {
    const putInvoice = (invoiceId: string, acct: string, extra: Record<string, unknown> = {}) =>
      invoices.put({
        invoiceId,
        pspInvoiceRef: `in_${invoiceId}`,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        currency: "EUR",
        status: "Open",
        total: "3.00",
        producerPspAccountRef: acct,
        ...extra,
      });

    beforeEach(async () => {
      await service.ensureParticipant({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
      });
      await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    });

    it("charges each invoice as one reused customer per consumer and producer account", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      putInvoice("inv-dc-1", "acct_p1");
      putInvoice("inv-dc-2", "acct_p1");
      putInvoice("inv-dc-3", "acct_p2");
      for (const invoiceId of ["inv-dc-1", "inv-dc-2", "inv-dc-3"]) {
        await service.payInvoice({ invoiceId, participantId: CONSUMER, communityId: COMMUNITY });
      }
      expect(psp.connectedCustomers.map((c) => c.pspAccountRef)).toEqual([
        "acct_p1",
        "acct_p2",
      ]);
      const [p1, p2, p3] = charge.mock.calls.map(([input]) => input);
      expect(p1).toMatchObject({
        invoiceId: "inv-dc-1",
        pspAccountRef: "acct_p1",
        pspPaymentMethodRef: "pm_card_visa",
        pspCustomerRef: psp.connectedCustomers[0]!.pspCustomerRef,
        idempotencyKey: "pay:inv-dc-1",
      });
      expect(p2!.pspCustomerRef).toBe(p1!.pspCustomerRef);
      expect(p3!.pspCustomerRef).toBe(psp.connectedCustomers[1]!.pspCustomerRef);
    });

    it("A6 pays an invoice that has no PSP invoice id", async () => {
      putInvoice("inv-dc-none", "acct_p1", { pspInvoiceRef: undefined });
      const paid = await service.payInvoice({
        invoiceId: "inv-dc-none",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      expect(paid.status).toBe("succeeded");
      expect(store.getPayment(paid.paymentId)?.pspInvoiceRef).toBeUndefined();
    });

    it("replays Pay on a settled invoice without a second charge", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      putInvoice("inv-dc-twice", "acct_p1");
      const first = await service.payInvoice({
        invoiceId: "inv-dc-twice",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      const again = await service.payInvoice({
        invoiceId: "inv-dc-twice",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      expect(again.paymentId).toBe(first.paymentId);
      expect(charge).toHaveBeenCalledTimes(1);
      const events = (await outboxStore.list()).filter(
        (e) => e.event.type === "PaymentStatusChanged",
      );
      // INT-368 — AC-06 still reports Open, so the replay re-announces the payment.
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.event.data)).toEqual([
        expect.objectContaining({
          paymentId: first.paymentId,
          status: "succeeded",
          payerId: CONSUMER,
          payeeId: PRODUCER,
        }),
        expect.objectContaining({
          paymentId: first.paymentId,
          status: "succeeded",
          payerId: CONSUMER,
          payeeId: PRODUCER,
        }),
      ]);
      expect(events[0]!.event.eventId).not.toBe(events[1]!.event.eventId);
    });

    it("INT-368 does not re-announce a replay once AC-06 shows the invoice Paid", async () => {
      putInvoice("inv-dc-paid", "acct_p1");
      const first = await service.payInvoice({
        invoiceId: "inv-dc-paid",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      putInvoice("inv-dc-paid", "acct_p1", { status: "Paid" });
      const again = await service.payInvoice({
        invoiceId: "inv-dc-paid",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      expect(again.paymentId).toBe(first.paymentId);
      const events = (await outboxStore.list()).filter(
        (e) => e.event.type === "PaymentStatusChanged",
      );
      expect(events).toHaveLength(1);
    });

    it("mock PSP never charges a paid Stripe invoice twice", async () => {
      const input = {
        invoiceId: "inv-x",
        amount: "1.00",
        currency: "EUR",
        pspAccountRef: "acct_p1",
        pspInvoiceRef: "in_x",
        pspCustomerRef: "cus_x",
        pspPaymentMethodRef: "pm_card_visa",
      };
      const a = await psp.createPayment(input);
      const b = await psp.createPayment(input);
      expect(b).toEqual(a);
      expect(psp.payments).toHaveLength(1);
    });

    it("maps Connect invoice.paid to PaymentStatusChanged succeeded", async () => {
      putInvoice("inv-dc-hook", "acct_p1");
      const payment = await service.payInvoice({
        invoiceId: "inv-dc-hook",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      const row = store.getPayment(payment.paymentId)!;
      store.putPayment({ ...row, status: "pending" });
      const body = JSON.stringify({
        id: "evt_test_invoice_paid_1",
        type: "invoice.paid",
        data: { pspInvoiceRef: "in_inv-dc-hook", pspAccountRef: "acct_p1", status: "paid" },
      });
      await service.receiveWebhook(body, MockPspAdapter.sign(body));
      expect(store.getPayment(payment.paymentId)?.status).toBe("succeeded");
      const last = (await outboxStore.list()).at(-1)!;
      expect(last.event).toMatchObject({
        type: "PaymentStatusChanged",
        data: { paymentId: payment.paymentId, invoiceId: "inv-dc-hook", status: "succeeded" },
      });
      // INT-326 — same Stripe event id is ignored.
      await service.receiveWebhook(body, MockPspAdapter.sign(body));
      expect(service.getWebhookDuplicateCount()).toBe(1);
    });

    it("maps Connect invoice.payment_failed to failed with a failure category", async () => {
      putInvoice("inv-dc-fail", "acct_p1");
      const payment = await service.payInvoice({
        invoiceId: "inv-dc-fail",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      const row = store.getPayment(payment.paymentId)!;
      store.putPayment({ ...row, status: "pending" });
      const body = JSON.stringify({
        id: "evt_test_invoice_failed_1",
        type: "invoice.payment_failed",
        data: { pspInvoiceRef: "in_inv-dc-fail", pspAccountRef: "acct_p1", status: "open" },
      });
      await service.receiveWebhook(body, MockPspAdapter.sign(body));
      expect(store.getPayment(payment.paymentId)).toMatchObject({
        status: "failed",
        failureCategory: "declined",
      });
      const last = (await outboxStore.list()).at(-1)!;
      expect(last.event.data).toMatchObject({ status: "failed", failureCategory: "declined" });
    });

    it("ignores invoice events for unknown Stripe invoices", async () => {
      const body = JSON.stringify({
        id: "evt_test_invoice_unknown",
        type: "invoice.paid",
        data: { pspInvoiceRef: "in_unknown" },
      });
      const before = (await outboxStore.list()).length;
      await service.receiveWebhook(body, MockPspAdapter.sign(body));
      expect((await outboxStore.list()).length).toBe(before);
    });

    it("validates EnsureConnectedCustomer input", async () => {
      await expect(
        service.ensureConnectedCustomer({ participantId: CONSUMER, pspAccountRef: "cus_1" }),
      ).rejects.toThrow(/acct_/);
      await expect(
        service.ensureConnectedCustomer({ participantId: "", pspAccountRef: "acct_1" }),
      ).rejects.toThrow(/participantId/);
    });
  });

  describe("REQ-014 pay through CollectPort (INT-425)", () => {
    const INV1 = "aaaaaaaa-0000-4000-8000-000000000001";
    const INV2 = "aaaaaaaa-0000-4000-8000-000000000002";
    const PROD_ACCT = "mock_acct_prod";
    const RETURN_URL = "https://ewds.example/return";

    const putInvoice = (invoiceId: string, extra: Record<string, unknown> = {}) =>
      invoices.put({
        invoiceId,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        currency: "EUR",
        status: "Open",
        total: "12.34",
        producerPspAccountRef: PROD_ACCT,
        ...extra,
      });
    const pay = (invoiceId: string, returnUrl?: string) =>
      service.payInvoice({ invoiceId, participantId: CONSUMER, communityId: COMMUNITY, returnUrl });
    const paymentEvents = async () =>
      (await outboxStore.list()).filter((e) => e.event.type === "PaymentStatusChanged");

    beforeEach(async () => {
      await service.ensureParticipant({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
      });
      await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
      putInvoice(INV1);
      putInvoice(INV2);
    });

    it("UAT-014 REQ-014 card: direct charge on the producer account, idempotent on invoice", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      clock.set("2026-11-24T10:00:00.000Z");
      const r = await pay(INV1);
      expect(r).toMatchObject({
        status: "succeeded",
        method: "card",
        amount: "12.34",
        currency: "EUR",
        initiatedAt: "2026-11-24T10:00:00.000Z",
      });
      expect(charge).toHaveBeenCalledWith(
        expect.objectContaining({
          pspAccountRef: PROD_ACCT,
          pspPaymentMethodRef: "pm_card_visa",
          idempotencyKey: `pay:${INV1}`,
        }),
      );
      // TE-2 — settledAt and processingTimeMs are set only by the webhook (Task 5.8).
      const row = store.getPayment(r.paymentId)!;
      expect(row).toMatchObject({ pspAccountRef: PROD_ACCT, initiatedAt: "2026-11-24T10:00:00.000Z" });
      expect(row.settledAt).toBeUndefined();
      expect(row.processingTimeMs).toBeUndefined();
      const [event] = await paymentEvents();
      expect(event!.event.data).toMatchObject({
        amount: "12.34",
        currency: "EUR",
        initiatedAt: "2026-11-24T10:00:00.000Z",
        payerId: CONSUMER,
        payeeId: PRODUCER,
      });
      expect(event!.event.data).not.toHaveProperty("processingTimeMs");
    });

    it("REQ-014 payInvoice twice on the same open invoice creates one charge", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      const first = await pay(INV1);
      const again = await pay(INV1);
      expect(charge).toHaveBeenCalledTimes(1);
      expect(again.paymentId).toBe(first.paymentId);
    });

    it("REQ-014 a double click while the first Pay is running joins it", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      const [a, b] = await Promise.all([pay(INV1), pay(INV1)]);
      expect(charge).toHaveBeenCalledTimes(1);
      expect(b.paymentId).toBe(a.paymentId);
      expect(store.listByInvoiceId(INV1)).toHaveLength(1);
    });

    it("REQ-014 a still-processing charge is returned without a second charge", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      const first = await pay(INV1);
      store.putPayment({ ...store.getPayment(first.paymentId)!, status: "pending" });
      const again = await pay(INV1);
      expect(again).toMatchObject({ paymentId: first.paymentId, status: "pending" });
      expect(charge).toHaveBeenCalledTimes(1);
    });

    it("UAT-016 REQ-014 retry after a decline uses a fresh idempotency key", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      await service.attachPaymentMethod(CONSUMER, "pm_fail_generic");
      const declined = await pay(INV1);
      expect(declined).toMatchObject({ status: "failed", failureCategory: "card_declined" });
      await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
      const retried = await pay(INV1);
      expect(retried.status).toBe("succeeded");
      expect(retried.paymentId).not.toBe(declined.paymentId);
      expect(charge.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
        `pay:${INV1}`,
        `pay:${INV1}:2`,
      ]);
    });

    it("UAT-057 REQ-014 SEPA: returns a PSP-hosted checkout URL, payment requires_action", async () => {
      await service.attachPaymentMethod(CONSUMER, "pm_sepa_1");
      const charge = vi.spyOn(psp, "createDirectCharge");
      const checkout = vi.spyOn(psp, "createCheckoutSession");
      clock.set("2026-11-24T10:00:00.000Z");
      const r = await pay(INV2, RETURN_URL);
      expect(r).toMatchObject({
        status: "requires_action",
        checkoutUrl: expect.stringMatching(/^https:\/\//),
        initiatedAt: "2026-11-24T10:00:00.000Z",
      });
      expect(checkout).toHaveBeenCalledWith(
        expect.objectContaining({
          methods: ["card", "sepa_debit"],
          saveForFutureUse: true,
          pspAccountRef: PROD_ACCT,
          successUrl: RETURN_URL,
          cancelUrl: RETURN_URL,
          idempotencyKey: `co:${INV2}:2026-11-24`,
        }),
      );
      expect(charge).not.toHaveBeenCalled();
      const row = store.getPayment(r.paymentId)!;
      expect(row).toMatchObject({
        status: "requires_action",
        pspCheckoutRef: expect.stringMatching(/^mock_co_/),
        initiatedAt: "2026-11-24T10:00:00.000Z",
      });
      expect(JSON.stringify(row)).not.toContain(r.checkoutUrl!);
      // PaymentStatusChanged has no requires_action state; the webhook announces the outcome.
      expect(await paymentEvents()).toHaveLength(0);
    });

    it("UAT-057 REQ-014 reopening an unfinished checkout reuses the payment and the session", async () => {
      await service.attachPaymentMethod(CONSUMER, "pm_sepa_1");
      clock.set("2026-11-24T10:00:00.000Z");
      const first = await pay(INV2, RETURN_URL);
      clock.set("2026-11-24T10:05:00.000Z");
      const again = await pay(INV2, RETURN_URL);
      expect(again).toMatchObject({
        paymentId: first.paymentId,
        checkoutUrl: first.checkoutUrl,
        initiatedAt: "2026-11-24T10:00:00.000Z",
      });
      clock.set("2026-11-25T08:00:00.000Z");
      const nextDay = await pay(INV2, RETURN_URL);
      expect(nextDay.paymentId).toBe(first.paymentId);
      expect(nextDay.checkoutUrl).not.toBe(first.checkoutUrl);
      expect(store.getPayment(first.paymentId)?.initiatedAt).toBe("2026-11-25T08:00:00.000Z");
      expect(store.listByInvoiceId(INV2)).toHaveLength(1);
    });

    it("REQ-014 no saved payment method goes to hosted checkout", async () => {
      await service.applyErasureRequested({
        requestId: "dddddddd-0000-4000-8000-000000000001",
        participantId: CONSUMER,
      });
      const r = await pay(INV2, RETURN_URL);
      expect(r).toMatchObject({ status: "requires_action", checkoutUrl: expect.any(String) });
    });

    it("REQ-014 a payment-method lookup failure falls back to the card charge", async () => {
      vi.spyOn(psp, "getPaymentMethodDetails").mockRejectedValueOnce(new Error("psp down"));
      const r = await pay(INV1);
      expect(r).toMatchObject({ status: "succeeded", method: "card" });
    });

    it("REQ-014 refuses when the producer has no connected account", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      putInvoice(INV1, { producerPspAccountRef: undefined });
      await expect(pay(INV1)).rejects.toThrow("Producer PSP account required for direct charge");
      expect(charge).not.toHaveBeenCalled();
    });

    it("REQ-014 refuses when the invoice names another producer account than AC-07", async () => {
      await service.provisionPaymentAccount({
        participantId: PRODUCER,
        communityId: COMMUNITY,
        role: "producer",
        fresh: true,
      });
      await expect(pay(INV1)).rejects.toThrow(/does not match AC-07/);
    });
  });

  it("rejects webhook without signature and malformed JSON body", async () => {
    await expect(service.receiveWebhook("{}", undefined as unknown as string)).rejects.toThrow(
      /Missing webhook signature/,
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
    expect(store.findByPspPaymentRef("missing")).toBeUndefined();
    expect(store.getPayment("missing")).toBeUndefined();
  });

  it("INT-233 — payInvoice hydrates durable consumer PM after memory clear", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    // Simulate pod restart: memory gone, Postgres/durable store still has the row.
    store.reset();
    invoices.put({
      invoiceId: "inv-durable",
      pspInvoiceRef: "in_inv-durable",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "3.00",
      producerPspAccountRef: "acct_durable_producer",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-durable",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("succeeded");
    expect(payment.amount).toBe("3.00");
  });

  it("INT-394 — card save and Start notify the registry participant, not the IdP sub", async () => {
    const idpSub = "d4e5f6a7-1111-4222-8333-444455556666";
    const notifier = {
      applyPaymentAccountStatus: vi.fn(async () => undefined),
    };
    const resolver = {
      resolveByIdpSub: vi.fn(async (sub: string) =>
        sub === idpSub
          ? { participantId: CONSUMER, communityId: COMMUNITY }
          : null,
      ),
    };
    service = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      notifier,
      accountsStore,
      resolver,
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    const session = await service.attachCallerPaymentMethod({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
      paymentMethodId: "pm_card_visa",
    });
    expect(session).toEqual({ mode: "elements", status: "complete" });
    expect(notifier.applyPaymentAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: CONSUMER,
        ready: true,
        notFound: "fail",
      }),
    );
    expect(store.getAccount(idpSub)).toBeUndefined();
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBe("pm_card_visa");
    await expect(service.getMyPaymentAccount(idpSub)).resolves.toMatchObject({
      status: "complete",
      last4: "4242",
    });
    const again = await service.startOnboarding({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(again).toEqual({ mode: "elements", status: "complete" });
  });

  it("INT-394 — attach fails closed when Ready notify fails", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    const failing = {
      applyPaymentAccountStatus: vi.fn(async () => {
        throw new Error("participants payment-account-status failed with 404");
      }),
    };
    const svc = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      failing,
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    await expect(
      svc.attachPaymentMethod(CONSUMER, "pm_card_visa"),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBe("pm_card_visa");
  });

  it("INT-230 — payInvoice resolves IdP sub to participantId", async () => {
    const idpSub = "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f";
    const resolver = {
      resolveByIdpSub: vi.fn(async () => ({
        participantId: CONSUMER,
        communityId: COMMUNITY,
      })),
    };
    service = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      resolver,
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-idp",
      pspInvoiceRef: "in_inv-idp",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "1.50",
      producerPspAccountRef: "acct_idp",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-idp",
      participantId: idpSub,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("succeeded");
    expect(resolver.resolveByIdpSub).toHaveBeenCalledWith(idpSub);
  });

  it("INT-395 — pays an invoice that names the consumer by IdP sub", async () => {
    const idpSub = "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f";
    const resolver = {
      resolveByIdpSub: vi.fn(async () => ({
        participantId: CONSUMER,
        communityId: COMMUNITY,
      })),
    };
    service = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      resolver,
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-idp-consumer",
      pspInvoiceRef: "in_inv-idp-consumer",
      producerId: PRODUCER,
      consumerId: idpSub,
      currency: "EUR",
      status: "Paid",
      total: "22.00",
      producerPspAccountRef: "acct_idp_consumer",
    });
    await expect(
      service.payInvoice({
        invoiceId: "inv-idp-consumer",
        participantId: idpSub,
        communityId: COMMUNITY,
      }),
    ).rejects.toThrow(/Paid is not payable/);
    await expect(
      service.payInvoice({
        invoiceId: "inv-idp-consumer",
        participantId: "someone-else",
        communityId: COMMUNITY,
      }),
    ).rejects.toThrow(/not payable by this participant/);
  });

  it("INT-251 — IdP resolve wins over a durable row keyed by the IdP sub", async () => {
    const idpSub = "c1a55e01-0001-4000-8000-000000000001";
    const resolver = {
      resolveByIdpSub: vi.fn(async () => ({
        participantId: CONSUMER,
        communityId: COMMUNITY,
      })),
    };
    service = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      resolver,
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    // Poison: account whose primary key is the IdP sub (prior failed resolve).
    await accountsStore.put({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
      pspAccountRef: null,
      pspPaymentMethodRef: "pm_poison",
      kycStatus: "none",
    });
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-poison",
      pspInvoiceRef: "in_inv-poison",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerPspAccountRef: "acct_ok",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-poison",
      participantId: idpSub,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("succeeded");
    expect(resolver.resolveByIdpSub).toHaveBeenCalledWith(idpSub);
  });

  // INT-269 / REQ-051 — prosumer Connect then Elements; Ready only with KYC + PM.
  it("INT-269 — prosumer Start is embedded Connect until KYC, then elements", async () => {
    const first = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
    });
    expect(first.mode).toBe("embedded");

    await service.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
      clientIp: "127.0.0.1",
      submission: {
        businessType: "individual",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        representative: {
          firstName: "A",
          lastName: "B",
          email: "a@b.co",
          address: { country: "FR" },
        },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
    expect(store.getAccount(PRODUCER)?.pspPaymentMethodRef).toBeFalsy();

    const second = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
    });
    expect(second.mode).toBe("elements");
    expect(second.status).toBe("requirements_due");
    expect(second.clientSecret).toBeTruthy();
  });

  it("INT-362 — prosumer Start goes to the card step once embedded Connect completes", async () => {
    const first = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
    });
    expect(first.mode).toBe("embedded");
    psp.completeOnboarding(first.pspAccountRef!);
    const next = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
    });
    expect(next).toMatchObject({ mode: "elements", status: "requirements_due" });
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("INT-269 — prosumer Ready only after KYC and payment method (REQ-045/051)", async () => {
    const readyCalls: Array<{ ready: boolean }> = [];
    const notifier = {
      applyPaymentAccountStatus: async (input: {
        participantId: string;
        ready: boolean;
      }) => {
        readyCalls.push({ ready: input.ready });
      },
    };
    const svc = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      notifier,
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    await svc.submitOnboardingRequirements({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
      clientIp: "127.0.0.1",
      submission: {
        businessType: "individual",
        businessProfileUrl: "https://p.example",
        businessProfileMcc: "5734",
        representative: {
          firstName: "A",
          lastName: "B",
          email: "a@b.co",
          address: { country: "FR" },
        },
        externalAccount: {
          country: "FR",
          currency: "eur",
          accountNumber: "FR1420041010050500013M02606",
        },
        tosAccepted: true,
      },
    });
    expect(readyCalls.at(-1)?.ready).toBe(false);

    await svc.attachPaymentMethod(PRODUCER, "pm_card_visa");
    expect(readyCalls.at(-1)?.ready).toBe(true);

    const summary = await svc.getMyPaymentAccount(PRODUCER);
    expect(summary.status).toBe("complete");
    expect(summary.last4).toBeTruthy();
    expect(summary.pspAccountRef).toMatch(/^acct_test_/);
  });

  it("INT-269 — provision prosumer attaches Connect and test PM", async () => {
    const row = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
      fresh: true,
    });
    expect(row.pspAccountRef).toMatch(/^acct_test_/);
    expect(store.getAccount(PRODUCER)?.pspPaymentMethodRef).toBe("pm_card_visa");
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
  });

  it("REQ-013 / INT-275 — erasure reports failed when PSP erase throws", async () => {
    const failingErase = new MockPspEraseAdapter();
    failingErase.erase = vi.fn().mockRejectedValue(new Error("stripe down"));
    const svc = new PaymentsService(
      store,
      new OutboxService(outboxStore),
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      new NoopParticipantsResolver(),
      failingErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new InMemoryConnectedCustomersStore(),
      psp,
      clock,
    );
    await svc.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    const result = await svc.applyErasureRequested({
      requestId: "dddddddd-eeee-4fff-8000-111111111111",
      participantId: PRODUCER,
    });
    expect(result.result).toBe("failed");
    const events = await outboxStore.list();
    const completed = events.find((e) => e.event.type === "ErasureCompleted");
    expect(completed?.event.data).toMatchObject({ result: "failed" });
  });

  it("REQ-013 / INT-275 — erasure completes when no payment account exists", async () => {
    const result = await service.applyErasureRequested({
      requestId: "eeeeeeee-ffff-4000-8000-222222222222",
      participantId: "00000000-0000-4000-8000-000000000099",
    });
    expect(result.result).toBe("completed");
    expect(pspErase.recorded()).toHaveLength(0);
  });

  it("REQ-013 / INT-275 — erasure clears payment method and emits ErasureCompleted", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBe("pm_card_visa");

    const result = await service.applyErasureRequested({
      requestId: "cccccccc-dddd-4eee-8fff-000000000001",
      participantId: CONSUMER,
    });
    expect(result.result).toBe("completed");
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBeNull();

    const events = await outboxStore.list();
    const completed = events.find((e) => e.event.type === "ErasureCompleted");
    expect(completed?.event.producer).toBe("AC-07");
    expect(completed?.event.data).toMatchObject({
      requestId: "cccccccc-dddd-4eee-8fff-000000000001",
      module: "AC-07",
      result: "completed",
    });
  });
});

