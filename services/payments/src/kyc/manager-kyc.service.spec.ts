/**
 * REQ-051 / UAT-063 — community-manager Stripe Identity (no Connect).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
import { InMemoryKycLogStore } from "../ports/kyc-log.store.js";
import { InMemoryManagerKycStore } from "../ports/manager-kyc.store.js";
import { InMemoryPaymentAccountsStore } from "../ports/payment-accounts.store.js";
import { MockPspAdapter } from "../psp/mock-psp.adapter.js";
import {
  DEFAULT_KYC_ACCOUNT_FIELDS,
  type AccountRecord,
} from "../domain/store.js";
import { KycQueryService, ManagerKycService } from "./manager-kyc.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const MANAGER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("ManagerKycService (REQ-051)", () => {
  let store: InMemoryManagerKycStore;
  let accounts: InMemoryPaymentAccountsStore;
  let kycLog: InMemoryKycLogStore;
  let outboxStore: InMemoryOutboxStore;
  let psp: MockPspAdapter;
  let service: ManagerKycService;
  let query: KycQueryService;

  beforeEach(() => {
    store = new InMemoryManagerKycStore();
    accounts = new InMemoryPaymentAccountsStore();
    kycLog = new InMemoryKycLogStore();
    outboxStore = new InMemoryOutboxStore();
    psp = new MockPspAdapter();
    const outbox = new OutboxService(outboxStore);
    service = new ManagerKycService(
      store,
      psp,
      kycLog,
      outbox,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    query = new KycQueryService(accounts, store);
  });

  it("REQ-051 / UAT-063: manager gets a hosted identity URL and no Connect account", async () => {
    const createConnected = vi.spyOn(psp, "createConnectedAccount");
    const result = await service.start(
      MANAGER,
      COMMUNITY,
      "https://ui.example/return",
    );
    expect(result.url).toMatch(/^https:\/\/verify\.stripe\.com\//);
    expect(result.status).toBe("pending");
    expect(createConnected).not.toHaveBeenCalled();
    const row = await store.get(MANAGER);
    expect(row).toMatchObject({
      subjectId: MANAGER,
      kycStatus: "pending",
      kycVerified: false,
      verificationId: result.verificationId,
    });
  });

  it("A7-bis: embedded surface returns clientSecret from Identity session", async () => {
    const result = await service.start(
      MANAGER,
      COMMUNITY,
      "https://ui.example/return",
      "embedded",
    );
    expect(result).toMatchObject({
      surface: "embedded",
      status: "pending",
      clientSecret: expect.stringMatching(/_secret_test$/),
    });
  });

  it("REQ-051: verified identity event sets kycVerified and emits KycStatusChanged{subjectType:'manager', method:'identity_document'}", async () => {
    const started = await service.start(
      MANAGER,
      COMMUNITY,
      "https://ui.example/return",
    );
    await service.onIdentityEvent(
      "evt_verified_1",
      started.verificationId,
      "identity.verification_session.verified",
    );
    const row = await store.get(MANAGER);
    expect(row?.kycVerified).toBe(true);
    expect(row?.kycStatus).toBe("verified");
    const events = await outboxStore.list();
    const changed = events.find((e) => e.event.type === "KycStatusChanged");
    expect(changed?.event.data).toMatchObject({
      subjectId: MANAGER,
      subjectType: "manager",
      kycStatus: "verified",
      kycVerified: true,
      method: "identity_document",
    });
    const logs = await kycLog.list(MANAGER);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.subjectType).toBe("manager");
  });

  it("REQ-051: duplicate identity webhook eventId is ignored", async () => {
    const started = await service.start(
      MANAGER,
      COMMUNITY,
      "https://ui.example/return",
    );
    await service.onIdentityEvent(
      "evt_9",
      started.verificationId,
      "identity.verification_session.verified",
    );
    await service.onIdentityEvent(
      "evt_9",
      started.verificationId,
      "identity.verification_session.verified",
    );
    const events = (await outboxStore.list()).filter(
      (e) => e.event.type === "KycStatusChanged",
    );
    expect(events).toHaveLength(1);
    expect(await kycLog.list(MANAGER)).toHaveLength(1);
  });

  it("statusOf returns none for unknown subject", async () => {
    expect(await query.statusOf("00000000-0000-4000-8000-000000000099")).toBe(
      "none",
    );
  });

  it("statusOf prefers participant over manager", async () => {
    const participant: AccountRecord = {
      participantId: MANAGER,
      pspAccountRef: "acct_1",
      pspPaymentMethodRef: null,
      kycStatus: "verified",
      role: "consumer",
      communityId: COMMUNITY,
      ...DEFAULT_KYC_ACCOUNT_FIELDS,
      kycVerified: true,
    };
    await accounts.put(participant);
    expect(await query.statusOf(MANAGER)).toBe("verified");
  });
});
