import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { createMockSuite } from "@intelligent/mocks";
import { AppModule } from "./app.module.js";
import { SettlementService } from "./settlement/settlement.service.js";
import { SettlementStore } from "./domain/store.js";

describe("settlement HTTP (INT-105)", () => {
  let app: INestApplication;
  let base: string;
  let service: SettlementService;
  let store: SettlementStore;
  const communityId = createMockSuite("S1").scenario.communityId;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(SettlementService);
    store = app.get(SettlementStore);
  });

  beforeEach(() => {
    service.resetStore();
    // HTTP smoke uses S1 amounts (< 5 €); invoice them with a low threshold.
    service.useFixtureScenario("S1", { threshold: 0.01 });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "settlement" });
  });

  it("startRun + getPairSettlement require service principal", async () => {
    const denied = await fetch(`${base}/internal/v1/billing-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        communityId,
        type: "periodic",
        period: "2026-11",
      }),
    });
    expect(denied.status).toBe(401);

    const start = await fetch(`${base}/internal/v1/billing-runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({
        communityId,
        type: "periodic",
        period: "2026-11",
      }),
    });
    expect(start.status).toBe(202);
    const { runId } = (await start.json()) as { runId: string };
    const settlementId = store.getRun(runId)!.settlementIds[0];

    const get = await fetch(
      `${base}/internal/v1/settlements/${settlementId}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      settlementId,
      runId,
      communityId,
      currency: "EUR",
    });

    // INT-196 — GET billing run returns settlementIds for invoice bridging.
    const runRes = await fetch(`${base}/internal/v1/billing-runs/${runId}`, {
      headers: { "x-intelligent-roles": "service" },
    });
    expect(runRes.status).toBe(200);
    const runJson = (await runRes.json()) as {
      runId: string;
      communityId: string;
      settlementIds: string[];
    };
    expect(runJson).toMatchObject({ runId, communityId });
    expect(runJson.settlementIds).toContain(settlementId);
    expect(runJson.settlementIds.length).toBeGreaterThanOrEqual(1);
  });

  // INT-211 — public balances + billing-run routes (REQ-057 / REQ-006).
  it("GET /v1/me/balances returns [] for member with no community", async () => {
    const res = await fetch(`${base}/v1/me/balances`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": "member-without-community",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /v1/me/balances lists unbilled counterparts for S1 consumer", async () => {
    const suite = createMockSuite("S1");
    const consumerId = suite.scenario.trades[0]!.buyerActorId;
    service.useFixtureScenario("S1", { threshold: 0.01 });
    const res = await fetch(`${base}/v1/me/balances`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": consumerId,
        "x-intelligent-community": communityId,
      },
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      counterpartId: string;
      amount: string;
      currency: string;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toMatchObject({ currency: "EUR" });
    expect(Number(rows[0]!.amount)).toBeGreaterThan(0);
  });

  it("POST /v1/communities/:id/billing-runs as manager returns public BillingRun", async () => {
    service.useFixtureScenario("S1", { threshold: 0.01 });
    const res = await fetch(`${base}/v1/communities/${communityId}/billing-runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "manager",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": "manager-1",
        "x-intelligent-community": communityId,
      },
      body: JSON.stringify({ type: "early" }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      runId: string;
      communityId: string;
      type: string;
      status: string;
      version: number;
    };
    expect(body).toMatchObject({
      communityId,
      type: "early",
      status: "completed",
      version: 1,
    });
    expect(body.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const get = await fetch(`${base}/v1/billing-runs/${body.runId}`, {
      headers: {
        "x-intelligent-roles": "manager",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": "manager-1",
      },
    });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ runId: body.runId, status: "completed" });
  });

  it("POST /v1/early-settlements settles one producer pair (BR-05)", async () => {
    const suite = createMockSuite("S1");
    const consumerId = suite.scenario.trades[0]!.buyerActorId;
    const producerId = suite.scenario.trades[0]!.sellerActorId;
    service.useFixtureScenario("S1", { threshold: 5 });
    const res = await fetch(`${base}/v1/early-settlements`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": consumerId,
        "x-intelligent-community": communityId,
      },
      body: JSON.stringify({ producerId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { runId: string; type: string; status: string };
    expect(body).toMatchObject({ type: "early", status: "completed" });
  });
});
