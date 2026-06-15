/**
 * INT-107 — P-PSP Stripe test mode (BR-12, REQ-014, REQ-040, REQ-051, NFR-015).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { PaymentsStore } from "../domain/store.js";
import { MockPspAdapter } from "../psp/mock-psp.adapter.js";
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
  let service: PaymentsService;

  beforeEach(() => {
    store = new PaymentsStore();
    outboxStore = new InMemoryOutboxStore();
    psp = new MockPspAdapter();
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

  it("defers Custom account create until KYC submit (INT-191 / REQ-051)", async () => {
    const session = await service.startOnboarding({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    expect(session.mode).toBe("requirements");
    expect(session.status).toBe("requirements_due");
    expect(session.currentlyDue?.length).toBeGreaterThan(0);
    expect(session.stripeAccountId).toBeUndefined();
    expect(store.getAccount(PRODUCER)?.stripeAccountId).toBeNull();
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("none");
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
    expect(psp.tokens.length).toBe(1);
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

  it("pays an invoice to the producer account (REQ-014, BR-12)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-1",
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
      type: "account.updated",
      data: { participantId: PRODUCER },
    });
    await service.receiveWebhook(body, MockPspAdapter.sign(body));
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");
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
    );
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: "inv-idp",
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
});

