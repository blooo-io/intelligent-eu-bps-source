/**
 * INT-107 — P-PSP Stripe test mode (BR-12, REQ-014, REQ-040, REQ-051, NFR-015).
 */
import "reflect-metadata";
import {
  BadGatewayException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
  StaticBillingModeResolver,
} from "@intelligent/module-template";
import type { Clock } from "../domain/clock.js";
import { PaymentsStore, type AccountRecord } from "../domain/store.js";
import { MockPspAdapter } from "../psp/mock-psp.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import { createTestPspRegistry } from "../psp/psp-registry.js";
import type { PspEvent } from "../psp/psp.types.js";
import { InMemoryInvoiceLookup } from "../ports/invoice-lookup.port.js";
import { InMemoryKycLogStore } from "../ports/kyc-log.store.js";
import { InMemoryPaymentAccountsStore } from "../ports/payment-accounts.store.js";
import { NoopParticipantsNotifier } from "../ports/participants-notifier.port.js";
import { NoopParticipantsResolver } from "../ports/participants-resolver.port.js";
import { KycService } from "../kyc/kyc.service.js";
import { PaymentsService } from "./payments.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const CONSUMER = "11111111-2222-4333-8444-555555555555";

/** REQ-045 — mark an existing account as KYC-verified for pay-path fixtures. */
async function markKycVerified(
  store: PaymentsStore,
  participantId: string,
  durable?: InMemoryPaymentAccountsStore,
): Promise<void> {
  const row = store.getAccount(participantId);
  if (!row) return;
  const updated: AccountRecord = {
    ...row,
    kycStatus: "verified",
    kycVerified: true,
    kycVerifiedAt: row.kycVerifiedAt ?? "2026-11-24T00:00:00.000Z",
    kycMethod: row.kycMethod ?? "connect_onboarding",
  };
  store.putAccount(updated);
  await durable?.put(updated);
}

/** REQ-045 — both parties must be KYC-verified before payInvoice. */
async function readyPayParties(
  service: PaymentsService,
  store: PaymentsStore,
  durable: InMemoryPaymentAccountsStore,
): Promise<void> {
  await service.ensureParticipant({
    participantId: CONSUMER,
    communityId: COMMUNITY,
    role: "consumer",
  });
  await service.ensureParticipant({
    participantId: PRODUCER,
    communityId: COMMUNITY,
    role: "producer",
  });
  await markKycVerified(store, CONSUMER, durable);
  await markKycVerified(store, PRODUCER, durable);
}

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
  let payoutEvents: { onPayoutEvent: Mock<(event: PspEvent) => Promise<void>> };
  let service: PaymentsService;
  let kycLog: InMemoryKycLogStore;

  const kycOf = (outbox = new OutboxService(outboxStore)) =>
    new KycService(store, accountsStore, kycLog, outbox);

  beforeEach(() => {
    clock = new TestClock();
    payoutEvents = { onPayoutEvent: vi.fn(async (_event: PspEvent) => undefined) };
    store = new PaymentsStore();
    outboxStore = new InMemoryOutboxStore();
    kycLog = new InMemoryKycLogStore();
    psp = new MockPspAdapter();
    pspErase = new MockPspEraseAdapter();
    invoices = new InMemoryInvoiceLookup();
    accountsStore = new InMemoryPaymentAccountsStore();
    const outbox = new OutboxService(outboxStore);
    const livePsp = new MockPspAdapter();
    service = new PaymentsService(
      store,
      outbox,
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(outbox),
      null,
      createTestPspRegistry({ test: psp, live: livePsp }),
      new StaticBillingModeResolver("virtual"),
    );
  });

  it("REQ-043 / UAT-054: virtual community never uses live adapter", async () => {
    const adapter = await service.pspFor(COMMUNITY);
    expect(adapter).toBe(psp);
  });

  it("REQ-043: live webhook for a virtual community is ignored", async () => {
    store.putPayment({
      paymentId: "pay-livemode",
      invoiceId: "inv-livemode",
      participantId: CONSUMER,
      amount: "10.00",
      currency: "EUR",
      status: "pending",
      pspPaymentRef: "mock_pay_livemode",
      communityId: COMMUNITY,
      initiatedAt: "2026-11-24T09:00:00.000Z",
    });
    const before = await outboxStore.list();
    const { rawBody, signature } = psp.signEvent({
      kind: "payment.succeeded",
      pspPaymentRef: "mock_pay_livemode",
      livemode: true,
    });
    await service.receiveWebhook(rawBody, signature);
    expect(store.getPayment("pay-livemode")?.status).toBe("pending");
    const after = await outboxStore.list();
    const newEvents = after.slice(before.length);
    expect(
      newEvents.filter((e) => e.event.type === "PaymentStatusChanged"),
    ).toHaveLength(0);
  });

  it("REQ-043: PaymentStatusChanged carries community live mode", async () => {
    const liveOutbox = new InMemoryOutboxStore();
    const outbox = new OutboxService(liveOutbox);
    const liveService = new PaymentsService(
      store,
      outbox,
      psp,
      invoices,
      new NoopParticipantsNotifier(),
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(outbox),
      null,
      createTestPspRegistry({ test: psp }),
      new StaticBillingModeResolver("live"),
    );
    store.putPayment({
      paymentId: "pay-mode",
      invoiceId: "inv-mode",
      participantId: CONSUMER,
      amount: "5.00",
      currency: "EUR",
      status: "pending",
      pspPaymentRef: "mock_pay_mode",
      communityId: COMMUNITY,
      initiatedAt: "2026-11-24T09:00:00.000Z",
    });
    const { rawBody, signature } = psp.signEvent({
      kind: "payment.succeeded",
      pspPaymentRef: "mock_pay_mode",
      livemode: true,
    });
    await liveService.receiveWebhook(rawBody, signature);
    const events = await liveOutbox.list();
    const changed = events.find((e) => e.event.type === "PaymentStatusChanged");
    expect(changed?.event.billingMode).toBe("live");
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

  it("provisions consumer with Connect test KYC (INT-228 / REQ-051)", async () => {
    const row = await service.provisionPaymentAccount({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
      fresh: true,
    });
    expect(row.participantId).toBe(CONSUMER);
    expect(row.pspAccountRef).toMatch(/^acct_test_/);
    expect(store.getAccount(CONSUMER)?.kycVerified).toBe(true);
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
    const midway = psp.signEvent({
      kind: "account.updated",
      participantId: PRODUCER,
      pspAccountRef: started.pspAccountRef,
    });
    await service.receiveWebhook(midway.rawBody, midway.signature);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");

    psp.completeOnboarding(started.pspAccountRef!);
    const done = psp.signEvent({
      kind: "account.updated",
      participantId: PRODUCER,
      pspAccountRef: started.pspAccountRef,
    });
    await service.receiveWebhook(done.rawBody, done.signature);
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
    const status = events.find((e) => e.event.type === "PaymentAccountStatusChanged");
    expect(status?.event.data).toMatchObject({
      participantId: CONSUMER,
      kycVerified: false,
      paymentMethodPresent: true,
    });
  });

  it("REQ-045: consumer with PM only is not Ready until KYC verified", async () => {
    const readyCalls: boolean[] = [];
    const notifier = {
      applyPaymentAccountStatus: async (input: { ready: boolean }) => {
        readyCalls.push(input.ready);
      },
    };
    const outbox = new OutboxService(outboxStore);
    const svc = new PaymentsService(
      store,
      outbox,
      psp,
      invoices,
      notifier,
      accountsStore,
      new NoopParticipantsResolver(),
      pspErase,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(outbox),
    );
    await svc.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await svc.attachPaymentMethod(CONSUMER, "pm_card_visa");
    expect(readyCalls.at(-1)).toBe(false);

    const kyc = kycOf(outbox);
    await kyc.applyAccountSession(
      CONSUMER,
      { mode: "embedded", status: "complete", payoutsEnabled: true },
      "operator",
      null,
    );
    await svc.attachPaymentMethod(CONSUMER, "pm_card_visa");
    expect(readyCalls.at(-1)).toBe(true);
  });

  it("startOnboarding with existing PM re-notifies Ready (INT-255)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    // REQ-051 — KYC first; Elements re-notify only after Connect is verified.
    const started = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    psp.completeOnboarding(started.pspAccountRef!);
    await service.startOnboarding({
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
    const started = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    psp.completeOnboarding(started.pspAccountRef!);
    await service.startOnboarding({
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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

  it("REQ-045 / UAT-056: payment refused when payer KYC not verified", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    // payer left unverified
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
    invoices.put({
      invoiceId: "inv-payer-kyc",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "5.00",
      producerPspAccountRef: "acct_payee_ok",
    });
    const charge = vi.spyOn(psp, "createDirectCharge");
    try {
      await service.payInvoice({
        invoiceId: "inv-payer-kyc",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      expect.fail("expected ForbiddenException");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toEqual({
        code: "kyc_not_verified",
        subject: "payer",
      });
    }
    expect(charge).not.toHaveBeenCalled();
  });

  it("REQ-045: payment refused when payee (producer) KYC not verified", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    // payee left unverified
    invoices.put({
      invoiceId: "inv-payee-kyc",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "5.00",
      producerPspAccountRef: "acct_payee_no",
    });
    const charge = vi.spyOn(psp, "createDirectCharge");
    try {
      await service.payInvoice({
        invoiceId: "inv-payee-kyc",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      expect.fail("expected ForbiddenException");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toEqual({
        code: "kyc_not_verified",
        subject: "payee",
      });
    }
    expect(charge).not.toHaveBeenCalled();
  });

  it("pays an invoice to the producer account (REQ-014, BR-12)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    const { rawBody, signature } = psp.signEvent({
      kind: "account.updated",
      participantId: PRODUCER,
    });
    await service.receiveWebhook(rawBody, signature);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("verified");

    // An account event that names no participant changes nothing.
    store.putAccount({ ...store.getAccount(PRODUCER)!, kycStatus: "pending" });
    const anonymous = psp.signEvent({ kind: "account.updated" });
    await service.receiveWebhook(anonymous.rawBody, anonymous.signature);
    expect(store.getAccount(PRODUCER)?.kycStatus).toBe("pending");
  });

  it("is idempotent on the PSP event id replay (INT-326 / 04 §7)", async () => {
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
    const { rawBody: body, signature: sig } = psp.signEvent({
      kind: "account.updated",
      participantId: PRODUCER,
    });
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

  it("REQ-051 / UAT-063: consumer onboarding starts with Connect KYC (embedded)", async () => {
    const session = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(session.mode).toBe("embedded");
    expect(session.pspAccountRef).toMatch(/^acct_/);
    expect(store.getAccount(CONSUMER)?.pspAccountRef).toBe(session.pspAccountRef);
  });

  it("REQ-051: consumer moves to card step after KYC complete", async () => {
    const started = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    psp.completeOnboarding(started.pspAccountRef!);
    const session = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(session.mode).toBe("elements");
    expect(session.clientSecret).toBeDefined();
    expect(session.clientSecret).toMatch(/^seti_test_/);
  });

  it("A7: hosted surface returns a PSP-hosted URL, never a billing URL", async () => {
    const prev = process.env.KYC_RETURN_URL_ALLOWLIST;
    process.env.KYC_RETURN_URL_ALLOWLIST = "https://ui.example";
    try {
      const session = await service.startOnboarding({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
        surface: "hosted",
        returnUrl: "https://ui.example/return",
      });
      expect(session.mode).toBe("hosted");
      expect(session.url).toMatch(/^https:\/\/mock-psp\.local\//);
      expect(session.url).not.toMatch(/blooo/i);
    } finally {
      if (prev === undefined) delete process.env.KYC_RETURN_URL_ALLOWLIST;
      else process.env.KYC_RETURN_URL_ALLOWLIST = prev;
    }
  });

  it("A7: hosted returnUrl outside allow-list is rejected", async () => {
    const prev = process.env.KYC_RETURN_URL_ALLOWLIST;
    process.env.KYC_RETURN_URL_ALLOWLIST = "https://ui.example";
    try {
      const { BadRequestException } = await import("@nestjs/common");
      await expect(
        service.startOnboarding({
          participantId: CONSUMER,
          communityId: COMMUNITY,
          role: "consumer",
          surface: "hosted",
          returnUrl: "https://evil.example/return",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      if (prev === undefined) delete process.env.KYC_RETURN_URL_ALLOWLIST;
      else process.env.KYC_RETURN_URL_ALLOWLIST = prev;
    }
  });

  it("returns elements after KYC; pay on an unknown invoice is not found (INT-193)", async () => {
    const started = await service.startOnboarding({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    psp.completeOnboarding(started.pspAccountRef!);
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    const { rawBody, signature } = psp.signEvent({
      kind: "payment.succeeded",
      pspAccountRef: "acct_x",
      pspPaymentRef: row.pspPaymentRef,
    });
    await service.receiveWebhook(rawBody, signature);
    expect(store.getPayment(payment.paymentId)?.status).toBe("succeeded");
  });

  it("marks payment failed on a payment.failed webhook", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
    const { rawBody, signature } = psp.signEvent({
      kind: "payment.failed",
      pspPaymentRef: row.pspPaymentRef,
    });
    await service.receiveWebhook(rawBody, signature);
    expect(store.getPayment(payment.paymentId)).toMatchObject({
      status: "failed",
      failureCategory: "other",
    });
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
      await readyPayParties(service, store, accountsStore);
      await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
      await markKycVerified(store, CONSUMER, accountsStore);
    });

    it("D2 / REQ-014 pay clones per charge with no connected Customer (A1)", async () => {
      const charge = vi.spyOn(psp, "createDirectCharge");
      putInvoice("inv-dc-1", "acct_p1");
      putInvoice("inv-dc-2", "acct_p1");
      putInvoice("inv-dc-3", "acct_p2");
      for (const invoiceId of ["inv-dc-1", "inv-dc-2", "inv-dc-3"]) {
        await service.payInvoice({ invoiceId, participantId: CONSUMER, communityId: COMMUNITY });
      }
      expect("ensureCustomer" in psp).toBe(false);
      expect("createConnectedCustomer" in psp).toBe(false);
      expect("createPayment" in psp).toBe(false);
      const [p1, p2, p3] = charge.mock.calls.map(([input]) => input);
      expect(p1).toMatchObject({
        invoiceId: "inv-dc-1",
        pspAccountRef: "acct_p1",
        pspPaymentMethodRef: "pm_card_visa",
        idempotencyKey: "pay:inv-dc-1",
      });
      expect(p1).not.toHaveProperty("pspCustomerRef");
      expect(p2).not.toHaveProperty("pspCustomerRef");
      expect(p3).toMatchObject({
        invoiceId: "inv-dc-3",
        pspAccountRef: "acct_p2",
        pspPaymentMethodRef: "pm_card_visa",
      });
      expect(p3).not.toHaveProperty("pspCustomerRef");
    });

    it("A6 pays an invoice that has no PSP invoice id", async () => {
      putInvoice("inv-dc-none", "acct_p1", { pspInvoiceRef: undefined });
      const paid = await service.payInvoice({
        invoiceId: "inv-dc-none",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      expect(paid.status).toBe("succeeded");
      expect(store.getPayment(paid.paymentId)).not.toHaveProperty("pspInvoiceRef");
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

    it("INT-376 a settled row stored without payeeId still names the producer", async () => {
      putInvoice("inv-dc-hook", "acct_p1");
      const payment = await service.payInvoice({
        invoiceId: "inv-dc-hook",
        participantId: CONSUMER,
        communityId: COMMUNITY,
      });
      const { payeeId: _payee, ...legacy } = store.getPayment(payment.paymentId)!;
      store.putPayment({ ...legacy, status: "pending" });
      const { rawBody, signature } = psp.signEvent({
        kind: "payment.succeeded",
        pspPaymentRef: legacy.pspPaymentRef,
      });
      await service.receiveWebhook(rawBody, signature);
      const last = (await outboxStore.list()).at(-1)!;
      expect(last.event).toMatchObject({
        type: "PaymentStatusChanged",
        data: { paymentId: payment.paymentId, status: "succeeded", payeeId: PRODUCER },
      });
    });

    it("INT-376 an unknown invoice leaves payeeId out of the settlement event", async () => {
      store.putPayment({
        paymentId: "pay-orphan",
        invoiceId: "inv-gone",
        participantId: CONSUMER,
        communityId: COMMUNITY,
        amount: "1.00",
        currency: "EUR",
        status: "pending",
        pspPaymentRef: "mock_pay_orphan",
      });
      const { rawBody, signature } = psp.signEvent({
        kind: "payment.succeeded",
        pspPaymentRef: "mock_pay_orphan",
      });
      await service.receiveWebhook(rawBody, signature);
      const last = (await outboxStore.list()).at(-1)!;
      expect(last.event.data).toMatchObject({ paymentId: "pay-orphan", status: "succeeded" });
      expect(last.event.data).not.toHaveProperty("payeeId");
      // Rows stored before initiatedAt or a PSP account existed get no timing and no fee.
      expect(store.getPayment("pay-orphan")).toMatchObject({ settledAt: expect.any(String) });
      expect(store.getPayment("pay-orphan")?.processingTimeMs).toBeUndefined();
      expect(store.getPayment("pay-orphan")?.feeAmount).toBeUndefined();
    });

    it("ignores payment events for unknown payment refs and unmapped kinds", async () => {
      const before = (await outboxStore.list()).length;
      for (const e of [
        psp.signEvent({ kind: "payment.succeeded", pspPaymentRef: "mock_pay_unknown" }),
        psp.signEvent({ kind: "payment.failed", pspPaymentRef: "mock_pay_unknown" }),
        psp.signEvent({ kind: "payment.succeeded" }),
        psp.signEvent({ kind: "checkout.completed", pspCheckoutRef: "mock_co_unknown" }),
        psp.signEvent({ kind: "payment.processing", pspPaymentRef: "mock_pay_unknown" }),
        psp.signEvent({ kind: "ignored" }),
      ]) {
        await service.receiveWebhook(e.rawBody, e.signature);
      }
      expect((await outboxStore.list()).length).toBe(before);
      expect(payoutEvents.onPayoutEvent).not.toHaveBeenCalled();
    });

    it("D2 connected-customers module and ensure path are gone", async () => {
      await expect(
        import("../ports/connected-customers.store.js"),
      ).rejects.toThrow();
      expect(service).not.toHaveProperty("ensureConnectedCustomer");
      expect(service).not.toHaveProperty("connectedCustomers");
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
      await readyPayParties(service, store, accountsStore);
      await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
      await markKycVerified(store, CONSUMER, accountsStore);
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

    describe("TE-2 webhook settlement (INT-425)", () => {
      const receive = async (e: Parameters<MockPspAdapter["signEvent"]>[0]) => {
        const signed = psp.signEvent(e);
        await service.receiveWebhook(signed.rawBody, signed.signature);
        return signed;
      };
      const lastEvent = async () => (await paymentEvents()).at(-1)!.event;
      const payCardAt = async (at: string) => {
        clock.set(at);
        const r = await pay(INV1);
        return store.getPayment(r.paymentId)!;
      };

      it("UAT-057 TE-2 settledAt from the webhook, processingTimeMs = settledAt - initiatedAt, fee recorded", async () => {
        const row = await payCardAt("2026-11-24T10:00:00.000Z");
        await receive({
          kind: "payment.succeeded",
          pspAccountRef: PROD_ACCT,
          pspPaymentRef: row.pspPaymentRef,
          occurredAt: "2026-11-24T10:00:02.500Z",
        });
        expect(store.getPayment(row.paymentId)).toMatchObject({
          status: "succeeded",
          settledAt: "2026-11-24T10:00:02.500Z",
          processingTimeMs: 2500,
          feeAmount: "0.44",
          feeCurrency: "EUR",
        });
        expect((await lastEvent()).data).toMatchObject({
          paymentId: row.paymentId,
          status: "succeeded",
          initiatedAt: "2026-11-24T10:00:00.000Z",
          settledAt: "2026-11-24T10:00:02.500Z",
          processingTimeMs: 2500,
          feeAmount: "0.44",
          feeCurrency: "EUR",
          method: "card",
          payeeId: PRODUCER,
        });
      });

      it("UAT-057 SEPA: checkout.completed sets initiatedAt; settlement 3 days later gives 259200000 ms and 0.35 fee", async () => {
        await service.attachPaymentMethod(CONSUMER, "pm_sepa_1");
        clock.set("2026-11-24T09:30:00.000Z");
        const r = await pay(INV2, RETURN_URL);
        const cs = store.getPayment(r.paymentId)!.pspCheckoutRef!;

        const completed = psp.completeCheckout(cs, "sepa_debit", "2026-11-24T10:00:00.000Z");
        await service.receiveWebhook(completed.rawBody, completed.signature);
        expect(store.getPayment(r.paymentId)).toMatchObject({
          status: "pending",
          pspPaymentRef: completed.pspPaymentRef,
          initiatedAt: "2026-11-24T10:00:00.000Z",
        });
        expect((await lastEvent()).data).toMatchObject({
          status: "pending",
          initiatedAt: "2026-11-24T10:00:00.000Z",
        });

        const settled = psp.settleSepa(completed.pspPaymentRef, "2026-11-27T10:00:00.000Z");
        await service.receiveWebhook(settled.rawBody, settled.signature);
        expect(store.findByPspPaymentRef(completed.pspPaymentRef)).toMatchObject({
          status: "succeeded",
          method: "sepa_debit",
          settledAt: "2026-11-27T10:00:00.000Z",
          processingTimeMs: 259200000,
          feeAmount: "0.35",
          feeCurrency: "EUR",
        });
      });

      it("TE-2 sync success is still settled by the later webhook (status already succeeded)", async () => {
        const row = await payCardAt("2026-11-24T10:00:00.000Z");
        expect(row).toMatchObject({ status: "succeeded" });
        expect(row.settledAt).toBeUndefined();
        expect(await paymentEvents()).toHaveLength(1);

        const first = await receive({
          kind: "payment.succeeded",
          pspAccountRef: PROD_ACCT,
          pspPaymentRef: row.pspPaymentRef,
          occurredAt: "2026-11-24T10:00:01.000Z",
        });
        expect(store.getPayment(row.paymentId)?.settledAt).toBe("2026-11-24T10:00:01.000Z");
        expect(await paymentEvents()).toHaveLength(2);

        await service.receiveWebhook(first.rawBody, first.signature);
        expect(service.getWebhookDuplicateCount()).toBe(1);
        expect(await paymentEvents()).toHaveLength(2);

        // A redelivery under a new PSP event id does not move settledAt either.
        await receive({
          kind: "payment.succeeded",
          pspPaymentRef: row.pspPaymentRef,
          occurredAt: "2026-11-24T10:05:00.000Z",
        });
        expect(store.getPayment(row.paymentId)?.settledAt).toBe("2026-11-24T10:00:01.000Z");
        expect(await paymentEvents()).toHaveLength(2);

        // A settled payment is not turned back into a failure.
        await receive({ kind: "payment.failed", pspPaymentRef: row.pspPaymentRef });
        expect(store.getPayment(row.paymentId)?.status).toBe("succeeded");
        expect(await paymentEvents()).toHaveLength(2);
      });

      it("UAT-016 payment.failed sets failedAt and canonical category", async () => {
        const row = await payCardAt("2026-11-24T10:00:00.000Z");
        store.putPayment({ ...row, status: "pending" });
        await receive({
          kind: "payment.failed",
          pspAccountRef: PROD_ACCT,
          pspPaymentRef: row.pspPaymentRef,
          failureCategory: "insufficient_funds",
          occurredAt: "2026-11-24T10:00:03.000Z",
        });
        const failed = store.getPayment(row.paymentId)!;
        expect(failed).toMatchObject({
          status: "failed",
          failureCategory: "insufficient_funds",
          failedAt: "2026-11-24T10:00:03.000Z",
        });
        expect(failed.processingTimeMs).toBeUndefined();
        const data = (await lastEvent()).data;
        expect(data).toMatchObject({ status: "failed", failureCategory: "insufficient_funds" });
        expect(data).not.toHaveProperty("failedAt");
        expect(data).not.toHaveProperty("settledAt");
      });

      it("UAT-016 a decline already announced by Pay records failedAt without a second event", async () => {
        await service.attachPaymentMethod(CONSUMER, "pm_fail_generic");
        clock.set("2026-11-24T10:00:00.000Z");
        const r = await pay(INV1);
        expect(r.status).toBe("failed");
        const pspPaymentRef = store.getPayment(r.paymentId)!.pspPaymentRef;
        await receive({
          kind: "payment.failed",
          pspPaymentRef,
          failureCategory: "card_declined",
          occurredAt: "2026-11-24T10:00:00.800Z",
        });
        expect(store.getPayment(r.paymentId)).toMatchObject({
          status: "failed",
          failedAt: "2026-11-24T10:00:00.800Z",
        });
        expect(await paymentEvents()).toHaveLength(1);

        await receive({ kind: "payment.failed", pspPaymentRef, occurredAt: "2026-11-24T10:09:00.000Z" });
        expect(store.getPayment(r.paymentId)?.failedAt).toBe("2026-11-24T10:00:00.800Z");
      });

      it("REQ-046 fee not yet available leaves feeAmount undefined, payment still settled", async () => {
        const row = await payCardAt("2026-11-24T10:00:00.000Z");
        vi.spyOn(psp, "getChargeSettlement").mockResolvedValueOnce(null);
        await receive({
          kind: "payment.succeeded",
          pspPaymentRef: row.pspPaymentRef,
          occurredAt: "2026-11-24T10:00:02.000Z",
        });
        const settled = store.getPayment(row.paymentId)!;
        expect(settled).toMatchObject({ status: "succeeded", settledAt: "2026-11-24T10:00:02.000Z" });
        expect(settled.feeAmount).toBeUndefined();
        expect((await lastEvent()).data).not.toHaveProperty("feeAmount");
      });

      it("REQ-046 a fee lookup error is logged by paymentId only and does not block settlement", async () => {
        const row = await payCardAt("2026-11-24T10:00:00.000Z");
        vi.spyOn(psp, "getChargeSettlement").mockRejectedValueOnce(new Error("psp down"));
        const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
        await receive({
          kind: "payment.succeeded",
          pspPaymentRef: row.pspPaymentRef,
          occurredAt: "2026-11-24T10:00:02.000Z",
        });
        expect(store.getPayment(row.paymentId)).toMatchObject({ settledAt: "2026-11-24T10:00:02.000Z" });
        expect(store.getPayment(row.paymentId)?.feeAmount).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(`psp.fee_unavailable paymentId=${row.paymentId}`);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(CONSUMER);
        warn.mockRestore();
      });

      it.each(["payout.paid", "payout.failed", "payout.canceled"] as const)(
        "REQ-015 %s events are forwarded to PAYOUT_EVENTS_HANDLER",
        async (kind) => {
          await receive({ kind, pspAccountRef: PROD_ACCT, pspPayoutRef: "po1" });
          expect(payoutEvents.onPayoutEvent).toHaveBeenCalledWith(
            expect.objectContaining({ kind, pspPayoutRef: "po1", pspAccountRef: PROD_ACCT }),
          );
          expect(await paymentEvents()).toHaveLength(0);
        },
      );

      it("TE-2 negative duration (clock skew) is clamped to 0", async () => {
        const row = await payCardAt("2026-11-24T10:00:00.000Z");
        await receive({
          kind: "payment.succeeded",
          pspPaymentRef: row.pspPaymentRef,
          occurredAt: "2026-11-24T09:59:58.000Z",
        });
        expect(store.getPayment(row.paymentId)).toMatchObject({
          settledAt: "2026-11-24T09:59:58.000Z",
          processingTimeMs: 0,
        });
      });

      it("TE-2 a card checkout settled before checkout.completed arrives is matched by invoice", async () => {
        await service.applyErasureRequested({
          requestId: "dddddddd-0000-4000-8000-000000000002",
          participantId: CONSUMER,
        });
        clock.set("2026-11-24T10:00:00.000Z");
        const r = await pay(INV2, RETURN_URL);
        const cs = store.getPayment(r.paymentId)!.pspCheckoutRef!;
        const completed = psp.completeCheckout(cs, "card", "2026-11-24T10:01:00.000Z");

        await receive({
          kind: "payment.succeeded",
          pspAccountRef: PROD_ACCT,
          pspPaymentRef: completed.pspPaymentRef,
          invoiceId: INV2,
          method: "card",
          occurredAt: "2026-11-24T10:01:00.500Z",
        });
        expect(store.getPayment(r.paymentId)).toMatchObject({
          status: "succeeded",
          pspPaymentRef: completed.pspPaymentRef,
          method: "card",
          settledAt: "2026-11-24T10:01:00.500Z",
          processingTimeMs: 60500,
          feeAmount: "0.44",
        });

        await service.receiveWebhook(completed.rawBody, completed.signature);
        expect(store.getPayment(r.paymentId)).toMatchObject({
          status: "succeeded",
          initiatedAt: "2026-11-24T10:00:00.000Z",
        });
        expect(await paymentEvents()).toHaveLength(1);
      });
    });
  });

  it("rejects webhook without signature and malformed JSON body", async () => {
    await expect(service.receiveWebhook("{}", undefined as unknown as string)).rejects.toThrow(
      /Missing webhook signature/,
    );
    const badJson = "{";
    await expect(service.receiveWebhook(badJson, MockPspAdapter.sign(badJson))).rejects.toThrow(
      /Invalid webhook signature/,
    );
    const blankId = JSON.stringify({ eventId: " ", kind: "ignored", occurredAt: "2026-11-24T10:00:00.000Z" });
    await expect(service.receiveWebhook(blankId, MockPspAdapter.sign(blankId))).rejects.toThrow(
      /Webhook missing event id/,
    );
    // A signed body in the legacy provider shape is not a neutral PSP event.
    const legacy = JSON.stringify({ id: "evt_legacy", type: "payment_intent.succeeded", data: {} });
    await expect(service.receiveWebhook(legacy, MockPspAdapter.sign(legacy))).rejects.toThrow(
      /Invalid webhook signature/,
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
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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

  it("REQ-045: card save without KYC notifies ready=false (IdP sub → participant)", async () => {
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
    );
    const session = await service.attachCallerPaymentMethod({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
      paymentMethodId: "pm_card_visa",
    });
    expect(session).toEqual({ mode: "elements", status: "complete" });
    // REQ-045 — every role needs KYC; PM alone is not Ready.
    expect(notifier.applyPaymentAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: CONSUMER,
        ready: false,
        notFound: "fail",
      }),
    );
    expect(store.getAccount(idpSub)).toBeUndefined();
    expect(store.getAccount(CONSUMER)?.pspPaymentMethodRef).toBe("pm_card_visa");
    await expect(service.getMyPaymentAccount(idpSub)).resolves.toMatchObject({
      status: "complete",
      last4: "4242",
    });
    // REQ-051 — with PM but no KYC, Start begins Connect (not Elements).
    const again = await service.startOnboarding({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(again.mode).toBe("embedded");
    expect(again.pspAccountRef).toMatch(/^acct_/);
    psp.completeOnboarding(again.pspAccountRef!);
    const elements = await service.startOnboarding({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
    });
    expect(elements).toEqual({ mode: "elements", status: "complete" });
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
    );
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
    );
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
    );
    // Poison: account whose primary key is the IdP sub (prior failed resolve).
    await accountsStore.put({
      participantId: idpSub,
      communityId: COMMUNITY,
      role: "consumer",
      pspAccountRef: null,
      pspPaymentMethodRef: "pm_poison",
      kycStatus: "none",
      kycVerified: false,
      kycVerifiedAt: null,
      kycMethod: null,
      payoutAccountVerified: false,
    });
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    await markKycVerified(store, CONSUMER, accountsStore);
    await service.ensureParticipant({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
    });
    await markKycVerified(store, PRODUCER, accountsStore);
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
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
    // Task 3.18 — local erase no longer calls the PSP port (eraseAtPsp does).
    expect(pspErase.recorded()).toHaveLength(0);

    const events = await outboxStore.list();
    const completed = events.find((e) => e.event.type === "ErasureCompleted");
    expect(completed?.event.producer).toBe("AC-07");
    expect(completed?.event.data).toMatchObject({
      requestId: "cccccccc-dddd-4eee-8fff-000000000001",
      module: "AC-07",
      result: "completed",
    });
  });

  it("REQ-013: personal-data returns payment method and KYC flags", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    const row = store.getAccount(CONSUMER)!;
    await accountsStore.put({
      ...row,
      kycStatus: "verified",
      kycVerified: true,
      kycVerifiedAt: "2026-11-25T10:00:00.000Z",
      payoutAccountVerified: false,
      kycLog: [
        {
          at: "2026-11-25T10:00:00.000Z",
          source: "webhook",
          kycStatus: "verified",
          pspEventId: "evt_1",
        },
      ],
      platformCustomerIds: ["cus_platform_1"],
    });
    store.putAccount(await accountsStore.get(CONSUMER)!);

    const data = await service.getPersonalData(CONSUMER);
    expect(data).toEqual({
      participantId: CONSUMER,
      pspAccountRef: null,
      paymentMethodPresent: true,
      kycStatus: "verified",
      kycVerified: true,
      kycVerifiedAt: "2026-11-25T10:00:00.000Z",
      payoutAccountVerified: false,
      kycLog: [
        {
          at: "2026-11-25T10:00:00.000Z",
          source: "webhook",
          kycStatus: "verified",
          pspEventId: "evt_1",
        },
      ],
    });
  });

  it("REQ-013: personal-data payload is never logged", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    const logSpy = vi.spyOn(Logger.prototype, "log");
    const warnSpy = vi.spyOn(Logger.prototype, "warn");
    const errorSpy = vi.spyOn(Logger.prototype, "error");
    await service.getPersonalData(CONSUMER);
    const joined = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(joined).not.toMatch(/@|visa|pm_card/i);
    expect(joined).toContain(CONSUMER);
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("REQ-013 / UAT-013: test-mode eraseAtPsp deletes via PSP port (empty connectedCustomers)", async () => {
    await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    const account = store.getAccount(PRODUCER)!;
    await accountsStore.put({
      ...account,
      platformCustomerIds: ["cus_plat"],
    });
    store.putAccount(await accountsStore.get(PRODUCER)!);

    const result = await service.eraseAtPsp(PRODUCER, { livemode: false });
    expect(result.outcome).toBe("erased");
    expect(pspErase.recorded()).toHaveLength(1);
    expect(pspErase.recorded()[0]).toMatchObject({
      participantId: PRODUCER,
      pspAccountRef: expect.stringMatching(/^acct_/),
      platformCustomerIds: ["cus_plat"],
      connectedCustomers: [],
      livemode: false,
    });
  });

  it("REQ-013: live-mode eraseAtPsp returns retained_by_psp", async () => {
    await service.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    const result = await service.eraseAtPsp(PRODUCER, { livemode: true });
    expect(result.outcome).toBe("retained_by_psp");
    expect(result.reason).toBe("aml_legal_obligation");
    expect(pspErase.recorded()[0]?.livemode).toBe(true);
  });

  it("REQ-013: eraseAtPsp reports failed when PSP erase throws", async () => {
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
      psp,
      clock,
      psp,
      payoutEvents,
      kycOf(),
    );
    await svc.provisionPaymentAccount({
      participantId: PRODUCER,
      communityId: COMMUNITY,
      role: "producer",
      fresh: true,
    });
    await expect(svc.eraseAtPsp(PRODUCER)).rejects.toThrow(/stripe down/);
  });
});

