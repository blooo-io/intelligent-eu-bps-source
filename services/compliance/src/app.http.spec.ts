import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ComplianceService } from "./compliance/compliance.service.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("compliance HTTP (INT-111)", () => {
  let app: INestApplication;
  let base: string;
  let service: ComplianceService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(ComplianceService);
  });

  beforeEach(() => {
    service.resetStore();
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
});
