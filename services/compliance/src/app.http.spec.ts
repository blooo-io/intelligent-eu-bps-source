import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ComplianceService } from "./compliance/compliance.service.js";
import {
  PARTICIPANT_COMMUNITY,
  type ParticipantCommunityPort,
} from "./ports/participant-community.port.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("compliance HTTP (INT-111)", () => {
  let app: INestApplication;
  let base: string;
  let service: ComplianceService;
  let directory: ParticipantCommunityPort;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(ComplianceService);
    directory = app.get<ParticipantCommunityPort>(PARTICIPANT_COMMUNITY);
  });

  beforeEach(() => {
    service.resetStore();
    // INT-375 — tests that still use the registry id as the token sub stay bound.
    directory.resolveByIdpSub = async (sub: string) => {
      if (sub === PARTICIPANT || sub === OTHER) {
        return { participantId: sub, communityId: COMMUNITY };
      }
      if (sub === "kc-member") {
        return { participantId: PARTICIPANT, communityId: COMMUNITY };
      }
      return null;
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "compliance" });
  });

  it("member can open erasure; retention requires service (REQ-013, REQ-011)", async () => {
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: ["inv-legal"],
    });

    const denied = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "erasure" }),
    });
    expect(denied.status).toBe(401);

    const created = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": PARTICIPANT,
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ type: "erasure" }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      requestId: string;
      status: string;
      participantId: string;
    };
    expect(body.participantId).toBe(PARTICIPANT);
    expect(body.status).toBe("propagating");

    const got = await fetch(`${base}/v1/data-subject-requests/${body.requestId}`, {
      headers: {
        "x-intelligent-roles": "dpo",
        "x-intelligent-sub": "dpo-1",
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({
      requestId: body.requestId,
      status: "propagating",
    });

    const retentionDenied = await fetch(`${base}/internal/v1/retention:apply`, {
      method: "POST",
    });
    expect(retentionDenied.status).toBe(401);

    service.setRetentionDays(1);
    const retention = await fetch(`${base}/internal/v1/retention:apply`, {
      method: "POST",
      headers: { "x-intelligent-roles": "service" },
    });
    expect(retention.status).toBe(202);
    expect(await retention.json()).toMatchObject({ accepted: true });
  });

  const OTHER = "22222222-2222-4333-8444-555555555555";
  const OTHER_COMMUNITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  // UAT-013 / REQ-049 — a member cannot erase or read a peer.
  it("UAT-013 — member cannot erase or read another participant (REQ-013, REQ-049)", async () => {
    service.seedPersonal({
      participantId: OTHER,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [],
    });
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [],
    });

    const created = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": PARTICIPANT,
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ type: "export", participantId: OTHER }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { requestId: string; participantId: string };
    expect(body.participantId).toBe(PARTICIPANT);

    const peer = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": OTHER,
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ type: "export" }),
    });
    expect(peer.status).toBe(201);
    const peerBody = (await peer.json()) as { requestId: string };

    const denied = await fetch(
      `${base}/v1/data-subject-requests/${peerBody.requestId}`,
      {
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-sub": PARTICIPANT,
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(denied.status).toBe(404);

    const foreignManager = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "manager",
        "x-intelligent-sub": "manager-b",
        "x-intelligent-community": OTHER_COMMUNITY,
      },
      body: JSON.stringify({ type: "erasure", participantId: OTHER }),
    });
    expect(foreignManager.status).toBe(404);
    expect(service.listPersonal().find((p) => p.participantId === OTHER)?.anonymized).toBe(
      false,
    );

    const sameManager = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "manager",
        "x-intelligent-sub": "manager-a",
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ type: "export", participantId: OTHER }),
    });
    expect(sameManager.status).toBe(201);
    expect(await sameManager.json()).toMatchObject({ participantId: OTHER });
  });

  // INT-375 — IdP sub is not the registry participant id (INT-230).
  it("INT-375 — a member request is stored under the registry participant", async () => {
    service.seedPersonal({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
      relationshipEndedAt: "2020-01-01T00:00:00.000Z",
      activeRelationship: false,
      anonymized: false,
      invoiceIds: [],
    });

    const unbound = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": "not-in-registry",
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ type: "erasure" }),
    });
    expect(unbound.status).toBe(404);

    const created = await fetch(`${base}/v1/data-subject-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": "kc-member",
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ type: "export", participantId: OTHER }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { requestId: string; participantId: string };
    expect(body.participantId).toBe(PARTICIPANT);

    const got = await fetch(`${base}/v1/data-subject-requests/${body.requestId}`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-sub": "kc-member",
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ participantId: PARTICIPANT });
  });
});
