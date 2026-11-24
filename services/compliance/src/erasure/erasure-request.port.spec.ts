/**
 * REQ-013 / Task 3.22 — ErasureRequestPort (EWDS-originated erasure).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
import { ComplianceStore } from "../domain/store.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import { FixturePersonalDataSources } from "../export/personal-data-sources.port.js";
import type { ParticipantCommunityPort } from "../ports/participant-community.port.js";
import { ComplianceService } from "../compliance/compliance.service.js";
import {
  createErasureRequestPort,
  NoneErasureRequestAdapter,
} from "./erasure-request.port.js";
import { MockErasureRequestAdapter } from "./mock-erasure-request.adapter.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const OTHER_COMMUNITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INV_RETAINED = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("ErasureRequestPort (REQ-013 / Task 3.22)", () => {
  let store: ComplianceStore;
  let idp: MockIdpAdapter;
  let psp: MockPspEraseAdapter;
  let mockPort: MockErasureRequestAdapter;
  let directory: ParticipantCommunityPort;
  let service: ComplianceService;

  beforeEach(() => {
    store = new ComplianceStore();
    idp = new MockIdpAdapter();
    psp = new MockPspEraseAdapter();
    mockPort = new MockErasureRequestAdapter();
    directory = {
      communityOf: vi.fn(async (id: string) =>
        id === PARTICIPANT ? COMMUNITY : null,
      ),
      resolveByIdpSub: vi.fn(async () => null),
    };
    service = new ComplianceService(
      store,
      new OutboxService(new InMemoryOutboxStore()),
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      idp,
      psp,
      directory,
      new FixturePersonalDataSources(),
      mockPort,
    );
    mockPort.onRequest(async (r) => {
      await service.acceptExternalErasureRequest(r);
    });
  });

  it("REQ-013 / UAT-013: EWDS erasure request starts propagation and reports completion", async () => {
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [INV_RETAINED],
    });

    await mockPort.push({
      externalRequestId: "ewds-erase-1",
      actorId: PARTICIPANT,
      communityId: COMMUNITY,
      issuedBy: "gateway-did-1",
      receivedAt: "2026-11-24T12:00:00.000Z",
    });

    expect(idp.recorded()).toHaveLength(1);
    const open = store.listRequests().find((r) => r.externalRequestId === "ewds-erase-1");
    expect(open?.origin).toBe("ewds");
    expect(open?.actorId).toBe("ewds:gateway-did-1");
    expect(open?.status).toBe("propagating");

    await service.onErasureCompleted({
      eventId: "e1",
      requestId: open!.requestId,
      module: "AC-03",
      result: "completed",
    });
    await service.onErasureCompleted({
      eventId: "e2",
      requestId: open!.requestId,
      module: "AC-06",
      result: "completed",
    });
    await service.onErasureCompleted({
      eventId: "e3",
      requestId: open!.requestId,
      module: "AC-07",
      result: "completed",
    });

    expect(mockPort.outcomes()[0]).toMatchObject({
      externalRequestId: "ewds-erase-1",
      outcome: { status: "completed", requestId: open!.requestId },
    });
    expect(mockPort.outcomes()[0]?.outcome.invoicesRetainedUntil).toMatch(
      /^\d{4}-12-31$/,
    );
  });

  it("REQ-013: duplicate externalRequestId creates one DSR", async () => {
    const inbound = {
      externalRequestId: "ewds-dup-1",
      actorId: PARTICIPANT,
      communityId: COMMUNITY,
      issuedBy: "gw",
      receivedAt: "2026-11-24T12:00:00.000Z",
    };
    const first = await service.acceptExternalErasureRequest(inbound);
    const second = await service.acceptExternalErasureRequest(inbound);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.requestId).toBe(first.requestId);
    expect(store.listRequests().filter((r) => r.externalRequestId === "ewds-dup-1")).toHaveLength(
      1,
    );
    expect(idp.recorded()).toHaveLength(1);
  });

  it("REQ-049: actor of another community is reported failed and not erased", async () => {
    await mockPort.push({
      externalRequestId: "ewds-wrong-comm",
      actorId: PARTICIPANT,
      communityId: OTHER_COMMUNITY,
      issuedBy: "gw",
      receivedAt: "2026-11-24T12:00:00.000Z",
    });
    expect(idp.recorded()).toHaveLength(0);
    expect(psp.recorded()).toHaveLength(0);
    expect(mockPort.outcomes()[0]).toMatchObject({
      externalRequestId: "ewds-wrong-comm",
      outcome: { status: "failed", requestId: "" },
    });
    expect(store.listRequests()).toHaveLength(0);
  });

  it("createErasureRequestPort defaults to none; mock when requested; ewds via adapter", () => {
    expect(createErasureRequestPort({})).toBeInstanceOf(NoneErasureRequestAdapter);
    expect(createErasureRequestPort({ ERASURE_REQUEST_SOURCE: "mock" })).toBeInstanceOf(
      MockErasureRequestAdapter,
    );
    expect(
      createErasureRequestPort({ ERASURE_SOURCE_ADAPTER: "mock" }),
    ).toBeInstanceOf(MockErasureRequestAdapter);
    // ewds without CGW credentials fails closed at construction (loadCgwConfig).
    expect(() =>
      createErasureRequestPort({
        ERASURE_SOURCE_ADAPTER: "ewds",
        CGW_BASE_URL: "http://cgw",
        // missing CGW_API_KEY
      }),
    ).toThrow(/CGW_API_KEY/);
  });
});
