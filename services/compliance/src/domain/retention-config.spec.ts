/**
 * REQ-011 / Task 3.23 — explicit configurable retention periods.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_POLICY,
  readRetentionPolicy,
} from "./retention-config.js";
import { ComplianceStore } from "./store.js";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import { NoopParticipantCommunity } from "../ports/participant-community.port.js";
import { FixturePersonalDataSources } from "../export/personal-data-sources.port.js";
import { NoneErasureRequestAdapter } from "../erasure/erasure-request.port.js";
import { ComplianceService } from "../compliance/compliance.service.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const INV_RETAINED = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("readRetentionPolicy (REQ-011)", () => {
  it("REQ-011: defaults are 365 days, 10 years invoices, 5 years KYC log", () => {
    expect(readRetentionPolicy({})).toEqual({
      personalRetentionDays: 365,
      invoiceRetentionYears: 10,
      kycLogRetentionYears: 5,
    });
    expect(DEFAULT_RETENTION_POLICY).toEqual(readRetentionPolicy({}));
  });

  it("REQ-011: RETENTION_INVOICE_YEARS=3 is rejected", () => {
    expect(() =>
      readRetentionPolicy({ RETENTION_INVOICE_YEARS: "3" }),
    ).toThrow(/invoiceRetentionYears must be between 6 and 10/);
  });

  it("REQ-011: RETENTION_KYC_LOG_YEARS below 5 is rejected", () => {
    expect(() =>
      readRetentionPolicy({ RETENTION_KYC_LOG_YEARS: "4" }),
    ).toThrow(/kycLogRetentionYears must be at least 5/);
  });

  it("REQ-011: custom in-range values are accepted", () => {
    expect(
      readRetentionPolicy({
        RETENTION_PERSONAL_DAYS: "180",
        RETENTION_INVOICE_YEARS: "6",
        RETENTION_KYC_LOG_YEARS: "7",
      }),
    ).toEqual({
      personalRetentionDays: 180,
      invoiceRetentionYears: 6,
      kycLogRetentionYears: 7,
    });
  });
});

describe("applyRetention with policy (REQ-011 / UAT-011)", () => {
  it("REQ-011 / UAT-011: retention anonymizes personal cache but keeps invoice ids", async () => {
    const store = new ComplianceStore();
    const policy = readRetentionPolicy({});
    store.setRetentionPolicy(policy);
    const service = new ComplianceService(
      store,
      new OutboxService(new InMemoryOutboxStore()),
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new MockIdpAdapter(),
      new MockPspEraseAdapter(),
      new NoopParticipantCommunity(),
      new FixturePersonalDataSources(),
      new NoneErasureRequestAdapter(),
    );

    service.setRetentionDays(30);
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [INV_RETAINED],
    });

    const result = await service.applyRetention("2026-10-17T00:00:00.000Z");
    expect(result).toEqual({ accepted: true, anonymized: 1 });
    const row = service.listPersonal().find((p) => p.participantId === PARTICIPANT);
    expect(row?.anonymized).toBe(true);
    expect(row?.invoiceIds).toEqual([INV_RETAINED]);
    expect(service.getRetentionPolicy()).toMatchObject({
      personalRetentionDays: 30,
      invoiceRetentionYears: policy.invoiceRetentionYears,
      kycLogRetentionYears: policy.kycLogRetentionYears,
    });
  });
});
