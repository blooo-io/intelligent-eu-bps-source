/**
 * REQ-045 / REQ-051 / UAT-056 / UAT-063 — one KYC readiness rule for all roles.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import {
  DEFAULT_KYC_ACCOUNT_FIELDS,
  PaymentsStore,
  type AccountRecord,
} from "../domain/store.js";
import { InMemoryKycLogStore } from "../ports/kyc-log.store.js";
import { InMemoryPaymentAccountsStore } from "../ports/payment-accounts.store.js";
import {
  canReceivePayout,
  KycService,
  kycReady,
} from "./kyc.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

function baseAccount(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    participantId: "p-1",
    pspAccountRef: "acct_1",
    pspPaymentMethodRef: null,
    kycStatus: "none",
    role: "consumer",
    communityId: COMMUNITY,
    ...DEFAULT_KYC_ACCOUNT_FIELDS,
    ...over,
  };
}

describe("kycReady / canReceivePayout (REQ-045)", () => {
  it("REQ-045 / UAT-056: consumer with card but no KYC is not ready", () => {
    expect(
      kycReady(
        baseAccount({
          role: "consumer",
          pspPaymentMethodRef: "pm_1",
          kycVerified: false,
        }),
      ),
    ).toBe(false);
  });

  it("REQ-045: producer ready on KYC only; prosumer needs KYC + PM", () => {
    expect(
      kycReady(
        baseAccount({
          role: "producer",
          kycVerified: true,
          pspPaymentMethodRef: null,
        }),
      ),
    ).toBe(true);
    expect(
      kycReady(
        baseAccount({
          role: "prosumer",
          kycVerified: true,
          pspPaymentMethodRef: null,
        }),
      ),
    ).toBe(false);
  });

  it("UAT-056: payout refused until payout account verified", () => {
    expect(
      canReceivePayout(
        baseAccount({
          role: "producer",
          kycVerified: true,
          payoutAccountVerified: false,
        }),
      ),
    ).toBe(false);
  });
});

describe("KycService.applyAccountSession (REQ-051)", () => {
  let store: PaymentsStore;
  let accounts: InMemoryPaymentAccountsStore;
  let kycLog: InMemoryKycLogStore;
  let outboxStore: InMemoryOutboxStore;
  let service: KycService;

  beforeEach(async () => {
    store = new PaymentsStore();
    accounts = new InMemoryPaymentAccountsStore();
    kycLog = new InMemoryKycLogStore();
    outboxStore = new InMemoryOutboxStore();
    service = new KycService(
      store,
      accounts,
      kycLog,
      new OutboxService(outboxStore),
    );
    const row = baseAccount({
      participantId: "p-1",
      role: "producer",
      kycStatus: "pending",
    });
    store.putAccount(row);
    await accounts.put(row);
  });

  it("REQ-051: complete session sets kycVerified, logs and emits KycStatusChanged once", async () => {
    const session = {
      mode: "embedded" as const,
      status: "complete" as const,
      payoutsEnabled: true,
    };
    await service.applyAccountSession("p-1", session, "webhook", "evt_1");
    await service.applyAccountSession("p-1", session, "webhook", "evt_1");

    const events = await outboxStore.list();
    const kycEvents = events.filter((e) => e.event.type === "KycStatusChanged");
    expect(kycEvents).toHaveLength(1);
    expect(kycEvents[0]?.event.data).toEqual({
      subjectId: "p-1",
      subjectType: "participant",
      kycStatus: "verified",
      kycVerified: true,
      method: "connect_onboarding",
      payoutAccountVerified: true,
    });
    expect(await kycLog.list("p-1")).toHaveLength(2);

    const account = store.getAccount("p-1");
    expect(account?.kycVerified).toBe(true);
    expect(account?.kycVerifiedAt).toMatch(/^\d{4}-/);
    expect(account?.payoutAccountVerified).toBe(true);
    expect(account?.kycMethod).toBe("connect_onboarding");
  });

  it("REQ-051: rejected.* disabled reason sets kycStatus rejected", async () => {
    await service.applyAccountSession(
      "p-1",
      {
        mode: "embedded",
        status: "requirements_due",
        disabledReason: "rejected.listed",
        payoutsEnabled: false,
      },
      "webhook",
      "evt_rej",
    );
    const account = store.getAccount("p-1");
    expect(account?.kycStatus).toBe("rejected");
    expect(account?.kycVerified).toBe(false);
    const events = await outboxStore.list();
    expect(
      events.find((e) => e.event.type === "KycStatusChanged")?.event.data,
    ).toMatchObject({
      kycStatus: "rejected",
      kycVerified: false,
      payoutAccountVerified: false,
    });
  });
});
