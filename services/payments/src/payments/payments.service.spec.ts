/**
 * INT-107 — P-PSP Stripe test mode (BR-12, REQ-014, REQ-040, REQ-051, NFR-015).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
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

describe("PaymentsService", () => {
  let store: PaymentsStore;
  let outboxStore: InMemoryOutboxStore;
  let psp: MockPspAdapter;
  let invoices: InMemoryInvoiceLookup;
  let accountsStore: InMemoryPaymentAccountsStore;
  let pspErase: MockPspEraseAdapter;
  let service: PaymentsService;

  beforeEach(() => {
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
    );
  });

  it("provisions a fresh producer Connect account each run (INT-228)", async () => {
    const first = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    expect(first.stripeAccountId).toMatch(/^acct_test_/);
    const second = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    expect(second.stripeAccountId).toMatch(/^acct_test_/);
    expect(second.stripeAccountId).not.toBe(first.stripeAccountId);
    const got = await service.getPaymentAccount(PRODUCER);
    expect(got.stripeAccountId).toBe(second.stripeAccountId);

    const reused = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: false,
    });
    expect(reused.stripeAccountId).toBe(second.stripeAccountId);
  });

  it("provisions consumer SetupIntent path (INT-228)", async () => {
    const row = await service.provisionPaymentAccount({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
      fresh: true,
    });
    expect(row.participantId).toBe(CONSUMER);
    expect(row.stripeAccountId).toBeNull();
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
    expect(session.stripeAccountId).toMatch(/^acct_test_/);
    expect(store.getAccount(PRODUCER)?.stripeAccountId).toBe(session.stripeAccountId);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");

    // A second Start reuses the account and issues a fresh Account Session.
    const again = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    expect(again.stripeAccountId).toBe(session.stripeAccountId);
    expect(again.clientSecret).toBeTruthy();
  });

  it("Start after the embedded component completes verifies KYC without a session (INT-362)", async () => {
    const started = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    psp.completeOnboarding(started.stripeAccountId!);
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
      data: { participantId: PRODUCER, stripeAccountId: started.stripeAccountId },
    });
    await service.receiveWebhook(midway, MockPspAdapter.sign(midway));
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");

    psp.completeOnboarding(started.stripeAccountId!);
    const done = JSON.stringify({
      id: "evt_test_account_updated_done",
      type: "account.updated",
      data: { participantId: PRODUCER, stripeAccountId: started.stripeAccountId },
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
    expect(session.stripeAccountId).toMatch(/^acct_test_/);
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
    const id = store.getAccount(PRODUCER)!.stripeAccountId!;
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
    expect(store.getAccount(PRODUCER)?.stripeAccountId).toMatch(/^acct_test_/);
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
    expect(store.getAccount(PRODUCER)?.stripeAccountId).toMatch(/^acct_test_/);
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
    expect(store.getAccount(PRODUCER)?.stripeAccountId).toMatch(/^acct_test_/);
    expect(psp.tokens).toHaveLength(1);
  });

  it("attaches payment method and emits PaymentAccountStatusChanged (REQ-040)", async () => {
    await service.ensureParticipant({
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

  it("startOnboarding still completes when Ready notify fails (INT-255)", async () => {
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
    );
    await expect(
      svc.startOnboarding({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
      }),
    ).resolves.toEqual({ mode: "elements", status: "complete" });
    expect(failing.applyPaymentAccountStatus).toHaveBeenCalled();
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
      stripeInvoiceId: "in_inv-sepa-1",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "12.00",
      producerStripeAccountId: "acct_test_producer",
    });
    const paid = await service.payInvoice({
      invoiceId: "inv-sepa-1",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(paid.method).toBe("sepa_debit");
    // INT-355 — direct charges cannot reuse a platform SEPA PaymentMethod (open decision).
    expect(paid).toMatchObject({ status: "failed", failureCategory: "sepa_debit_not_shareable" });
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
    expect(summary.stripeAccountId).toMatch(/^acct_test_/);
    expect(summary.dashboardUrl).toContain(summary.stripeAccountId!);
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
      stripeInvoiceId: "in_inv-1",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerStripeAccountId: "acct_test_producer",
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
      stripeInvoiceId: "in_inv-2",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerStripeAccountId: "acct_test_producer",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-2",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("failed");
    expect(payment.failureCategory).toBe("insufficient_funds");

    await service.attachPaymentMethod(CONSUMER, "pm_fail_generic");
    invoices.put({
      invoiceId: "inv-3",
      stripeInvoiceId: "in_inv-3",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerStripeAccountId: "acct_test_producer",
    });
    const declined = await service.payInvoice({
      invoiceId: "inv-3",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(declined.failureCategory).toBe("declined");
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

  it("returns consumer SetupIntent elements session and rejects pay without method (INT-193)", async () => {
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
    ).rejects.toThrow(/payment method/);
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
      stripeInvoiceId: "in_inv-pending",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "1.00",
      producerStripeAccountId: "acct_x",
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
      data: { stripePaymentId: row.stripePaymentId },
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
      stripeInvoiceId: "in_inv-fail-hook",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "1.00",
      producerStripeAccountId: "acct_x",
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
      data: { stripePaymentId: row.stripePaymentId, failureCategory: "declined" },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getPayment(payment.paymentId)?.status).toBe("failed");
  });

  describe("UAT-014 / UAT-015 REQ-014 direct charge on the producer Connect account (INT-355)", () => {
    const putInvoice = (invoiceId: string, acct: string, extra: Record<string, unknown> = {}) =>
      invoices.put({
        invoiceId,
        stripeInvoiceId: `in_${invoiceId}`,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        currency: "EUR",
        status: "Open",
        total: "3.00",
        producerStripeAccountId: acct,
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

    it("pays the Stripe invoice as one reused Customer per consumer and connected account", async () => {
      putInvoice("inv-dc-1", "acct_p1");
      putInvoice("inv-dc-2", "acct_p1");
      putInvoice("inv-dc-3", "acct_p2");
      for (const invoiceId of ["inv-dc-1", "inv-dc-2", "inv-dc-3"]) {
        await service.payInvoice({ invoiceId, participantId: CONSUMER, communityId: COMMUNITY });
      }
      expect(psp.connectedCustomers.map((c) => c.stripeAccountId)).toEqual([
        "acct_p1",
        "acct_p2",
      ]);
      const [p1, p2, p3] = psp.paymentInputs;
      expect(p1).toMatchObject({
        stripeInvoiceId: "in_inv-dc-1",
        producerStripeAccountId: "acct_p1",
        consumerPaymentMethodId: "pm_card_visa",
        connectedCustomerId: psp.connectedCustomers[0]!.stripeCustomerId,
      });
      expect(p2!.connectedCustomerId).toBe(p1!.connectedCustomerId);
      expect(p3!.connectedCustomerId).toBe(psp.connectedCustomers[1]!.stripeCustomerId);
    });

    it("rejects an invoice without a Stripe invoice id", async () => {
      putInvoice("inv-dc-none", "acct_p1", { stripeInvoiceId: undefined });
      await expect(
        service.payInvoice({ invoiceId: "inv-dc-none", participantId: CONSUMER, communityId: COMMUNITY }),
      ).rejects.toThrow(/Stripe invoice required/);
    });

    it("replays Pay on a settled invoice without a second charge", async () => {
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
      expect(psp.paymentInputs).toHaveLength(1);
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
        producerStripeAccountId: "acct_p1",
        stripeInvoiceId: "in_x",
        connectedCustomerId: "cus_x",
        consumerPaymentMethodId: "pm_card_visa",
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
        data: { stripeInvoiceId: "in_inv-dc-hook", stripeAccountId: "acct_p1", status: "paid" },
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
        data: { stripeInvoiceId: "in_inv-dc-fail", stripeAccountId: "acct_p1", status: "open" },
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
        data: { stripeInvoiceId: "in_unknown" },
      });
      const before = (await outboxStore.list()).length;
      await service.receiveWebhook(body, MockPspAdapter.sign(body));
      expect((await outboxStore.list()).length).toBe(before);
    });

    it("validates EnsureConnectedCustomer input", async () => {
      await expect(
        service.ensureConnectedCustomer({ participantId: CONSUMER, stripeAccountId: "cus_1" }),
      ).rejects.toThrow(/acct_/);
      await expect(
        service.ensureConnectedCustomer({ participantId: "", stripeAccountId: "acct_1" }),
      ).rejects.toThrow(/participantId/);
    });
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
      stripeInvoiceId: "in_inv-durable",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "3.00",
      producerStripeAccountId: "acct_durable_producer",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-durable",
      participantId: CONSUMER,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("succeeded");
    expect(payment.amount).toBe("3.00");
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
    );
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-idp",
      stripeInvoiceId: "in_inv-idp",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "1.50",
      producerStripeAccountId: "acct_idp",
    });
    const payment = await service.payInvoice({
      invoiceId: "inv-idp",
      participantId: idpSub,
      communityId: COMMUNITY,
    });
    expect(payment.status).toBe("succeeded");
    expect(resolver.resolveByIdpSub).toHaveBeenCalledWith(idpSub);
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
    );
    // Poison: account whose primary key is the IdP sub (prior failed resolve).
    await accountsStore.put({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
      stripeAccountId: null,
      paymentMethodId: "pm_poison",
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
      stripeInvoiceId: "in_inv-poison",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerStripeAccountId: "acct_ok",
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
    expect(store.getAccount(PRODUCER)?.paymentMethodId).toBeFalsy();

    const second = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
    });
    expect(second.mode).toBe("elements");
    expect(second.status).toBe("requirements_due");
    expect(second.clientSecret).toBeTruthy();
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
    expect(summary.stripeAccountId).toMatch(/^acct_test_/);
  });

  it("INT-269 — provision prosumer attaches Connect and test PM", async () => {
    const row = await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "prosumer",
      fresh: true,
    });
    expect(row.stripeAccountId).toMatch(/^acct_test_/);
    expect(store.getAccount(PRODUCER)?.paymentMethodId).toBe("pm_card_visa");
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
    expect(store.getAccount(CONSUMER)?.paymentMethodId).toBe("pm_card_visa");

    const result = await service.applyErasureRequested({
      requestId: "cccccccc-dddd-4eee-8fff-000000000001",
      participantId: CONSUMER,
    });
    expect(result.result).toBe("completed");
    expect(store.getAccount(CONSUMER)?.paymentMethodId).toBeNull();

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

