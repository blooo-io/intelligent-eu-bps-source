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
});
