/**
 * INT-111 — AC-12 compliance (REQ-011, REQ-013, REQ-030 / UAT-011, UAT-013, UAT-030 / S12).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
import { ComplianceStore } from "../domain/store.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import { NoopParticipantCommunity } from "../ports/participant-community.port.js";
import { ComplianceService } from "./compliance.service.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const INV_RETAINED = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("ComplianceService", () => {
  let store: ComplianceStore;
  let outboxStore: InMemoryOutboxStore;
  let idp: MockIdpAdapter;
  let psp: MockPspEraseAdapter;
  let service: ComplianceService;

  beforeEach(() => {
    store = new ComplianceStore();
    outboxStore = new InMemoryOutboxStore();
    idp = new MockIdpAdapter();
    psp = new MockPspEraseAdapter();
    service = new ComplianceService(
      store,
      new OutboxService(outboxStore),
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      idp,
      psp,
      new NoopParticipantCommunity(),
    );
  });

  it("UAT-013 / S12 — erasure propagates to modules, IdP and PSP; invoices retained", async () => {
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [INV_RETAINED],
    });

    const created = await service.createDataSubjectRequest({
      type: "erasure",
      participantId: PARTICIPANT,
      actorId: ACTOR,
      communityId: COMMUNITY,
    });
    expect(created.status).toBe("propagating");

    // ErasureRequested outbox event (identifiers only).
    const events = await outboxStore.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.event.type).toBe("ErasureRequested");
    expect(events[0]?.event.producer).toBe("AC-12");
    expect(events[0]?.event.data).toEqual({
      requestId: created.requestId,
      participantId: PARTICIPANT,
    });
    expect(JSON.stringify(events)).not.toMatch(/@|iban|name/i);

    // IdP + payment provider commands recorded (REQ-013).
    expect(service.idpRecorded()).toHaveLength(1);
    expect(service.pspRecorded()).toHaveLength(1);
    expect(service.idpRecorded()[0]?.participantId).toBe(PARTICIPANT);
    expect(service.pspRecorded()[0]?.requestId).toBe(created.requestId);

    // Local personal data anonymized; invoice ids kept for legal retention.
    expect(service.listPersonal()[0]?.anonymized).toBe(true);
    expect(service.listPersonal()[0]?.invoiceIds).toEqual([INV_RETAINED]);

    await service.onErasureCompleted({
      eventId: "11111111-1111-4111-8111-111111111111",
      requestId: created.requestId,
      module: "AC-03",
      result: "completed",
    });
    await service.onErasureCompleted({
      eventId: "22222222-2222-4222-8222-222222222222",
      requestId: created.requestId,
      module: "AC-06",
      result: "completed",
    });
    expect(service.getRequest(created.requestId).status).toBe("propagating");

    await service.onErasureCompleted({
      eventId: "33333333-3333-4333-8333-333333333333",
      requestId: created.requestId,
      module: "AC-07",
      result: "completed",
    });

    const done = service.getRequestDetail(created.requestId);
    expect(done.status).toBe("completed");
    expect(done.confirmation).toMatchObject({
      kind: "erasure",
      participantId: PARTICIPANT,
      invoicesRetained: [INV_RETAINED],
    });

    // Audit trail without personal data (REQ-030).
    const audits = service.listAudits();
    expect(audits.length).toBeGreaterThanOrEqual(3);
    expect(audits.every((a) => a.actorId && a.action && a.target && a.timestamp)).toBe(
      true,
    );
    expect(JSON.stringify(audits)).not.toContain("@");
  });

  it("UAT-011 — ApplyRetention anonymizes expired personal data", async () => {
    service.setRetentionDays(30);
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [INV_RETAINED],
    });
    service.seedPersonal({
      participantId: "22222222-2222-4333-8444-555555555555",
      communityId: COMMUNITY,
      relationshipEndedAt: new Date().toISOString(),
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [],
    });
    service.seedPersonal({
      participantId: "33333333-3333-4333-8444-555555555555",
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: true,
      anonymized: false,
      invoiceIds: [],
    });

    const result = await service.applyRetention("2026-10-17T00:00:00.000Z");
    expect(result).toEqual({ accepted: true, anonymized: 1 });
    expect(service.listPersonal().find((p) => p.participantId === PARTICIPANT)?.anonymized).toBe(
      true,
    );
    expect(
      service.listPersonal().find((p) => p.participantId === PARTICIPANT)?.invoiceIds,
    ).toEqual([INV_RETAINED]);
    expect(
      service.listPersonal().find(
        (p) => p.participantId === "22222222-2222-4333-8444-555555555555",
      )?.anonymized,
    ).toBe(false);
    expect(
      service.listPersonal().find(
        (p) => p.participantId === "33333333-3333-4333-8444-555555555555",
      )?.anonymized,
    ).toBe(false);
  });

  it("UAT-030 — AuditableActionPerformed is stored with actor/action/target/timestamp", async () => {
    await service.onAuditableActionPerformed({
      eventId: "44444444-4444-4444-8444-444444444444",
      actorId: ACTOR,
      action: "invoice.read",
      target: `participant:${PARTICIPANT}`,
      timestamp: "2026-10-17T12:00:00.000Z",
    });
    // Duplicate eventId ignored.
    await service.onAuditableActionPerformed({
      eventId: "44444444-4444-4444-8444-444444444444",
      actorId: ACTOR,
      action: "invoice.read",
      target: `participant:${PARTICIPANT}`,
      timestamp: "2026-10-17T12:00:00.000Z",
    });
    expect(service.listAudits()).toHaveLength(1);
    expect(service.listAudits()[0]).toMatchObject({
      actorId: ACTOR,
      action: "invoice.read",
      target: `participant:${PARTICIPANT}`,
      timestamp: "2026-10-17T12:00:00.000Z",
    });
  });

  it("REQ-049 — a caller outside the community cannot read the request", async () => {
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2024-01-01T00:00:00.000Z",
      activeRelationship: true,
      anonymized: false,
      invoiceIds: [],
    });
    const created = await service.createDataSubjectRequest({
      type: "export",
      participantId: PARTICIPANT,
      actorId: ACTOR,
      communityId: COMMUNITY,
    });
    expect(() =>
      service.getRequestForCaller(created.requestId, {
        sub: "other",
        communityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        roles: ["dpo"],
      }),
    ).toThrow(/Unknown request/);
    expect(
      service.getRequestForCaller(created.requestId, {
        sub: PARTICIPANT,
        communityId: COMMUNITY,
        roles: ["member"],
      }).participantId,
    ).toBe(PARTICIPANT);
    await expect(
      service.assertParticipantInCommunity(PARTICIPANT, COMMUNITY),
    ).resolves.toBeUndefined();
    await expect(
      service.assertParticipantInCommunity(PARTICIPANT, ""),
    ).rejects.toThrow(/community scope/);
    await expect(
      service.assertParticipantInCommunity(
        "99999999-9999-4999-8999-999999999999",
        COMMUNITY,
      ),
    ).rejects.toThrow(/Unknown participant/);
  });

  it("export completes with confirmation listing retained invoices", async () => {
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2024-01-01T00:00:00.000Z",
      activeRelationship: true,
      anonymized: false,
      invoiceIds: [INV_RETAINED],
    });
    const created = await service.createDataSubjectRequest({
      type: "export",
      participantId: PARTICIPANT,
      actorId: ACTOR,
      communityId: COMMUNITY,
    });
    expect(created.status).toBe("completed");
    expect(service.getRequestDetail(created.requestId).confirmation).toMatchObject({
      kind: "export",
      invoicesRetained: [INV_RETAINED],
    });
    expect(await outboxStore.list()).toHaveLength(0);
  });

  it("deduplicates ErasureCompleted on eventId", async () => {
    const created = await service.createDataSubjectRequest({
      type: "erasure",
      participantId: PARTICIPANT,
      actorId: ACTOR,
      communityId: COMMUNITY,
    });
    const event = {
      eventId: "55555555-5555-4555-8555-555555555555",
      requestId: created.requestId,
      module: "AC-03" as const,
      result: "completed" as const,
    };
    expect(await service.onErasureCompleted(event)).toEqual({ status: "processed" });
    expect(await service.onErasureCompleted(event)).toEqual({ status: "duplicate" });
  });
});
