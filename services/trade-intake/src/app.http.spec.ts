/**
 * INT-104 — HTTP surface for internal trade-intake OpenAPI.
 */
import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { createMockSuite } from "@intelligent/mocks";
import { AppModule } from "./app.module.js";
import { IntakeService } from "./intake/intake.service.js";

describe("trade-intake HTTP (INT-104)", () => {
  let app: INestApplication;
  let base: string;
  let service: IntakeService;
  const communityId = createMockSuite("S1").scenario.communityId;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(IntakeService);
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
    expect(await res.json()).toEqual({ status: "ok", module: "trade-intake" });
  });

  it("refresh + unbilled require service principal", async () => {
    const denied = await fetch(`${base}/internal/v1/intake:refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "2026-11-01T00:00:00Z",
        to: "2026-11-02T00:00:00Z",
      }),
    });
    expect(denied.status).toBe(401);

    const refresh = await fetch(`${base}/internal/v1/intake:refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({
        from: "2026-11-01T00:00:00Z",
        to: "2026-11-02T00:00:00Z",
      }),
    });
    expect(refresh.status).toBe(202);
    expect(await refresh.json()).toMatchObject({ accepted: true, ingested: 2 });

    const unbilled = await fetch(
      `${base}/internal/v1/trades/unbilled?until=2026-11-02T00:00:00Z&communityId=${communityId}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(unbilled.status).toBe(200);
    const body = (await unbilled.json()) as unknown[];
    expect(body).toHaveLength(2);
  });

  it("POST intake:check-health returns 204", async () => {
    const res = await fetch(`${base}/internal/v1/intake:check-health`, {
      method: "POST",
      headers: { "x-intelligent-roles": "service" },
    });
    expect(res.status).toBe(204);
  });

  it("GET /v1/intake/anomalies lists for operator (INT-218 / REQ-029)", async () => {
    const denied = await fetch(`${base}/v1/intake/anomalies`);
    expect(denied.status).toBe(401);

    const empty = await fetch(`${base}/v1/intake/anomalies`, {
      headers: { "x-intelligent-roles": "operator" },
    });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    await fetch(`${base}/internal/v1/intake:refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({
        from: "2026-11-01T00:00:00Z",
        to: "2026-11-02T00:00:00Z",
      }),
    });
    // Refresh with fixture parties yields no anomalies; shape must still be an array.
    const list = await fetch(`${base}/v1/intake/anomalies`, {
      headers: { "x-intelligent-roles": "operator" },
    });
    expect(list.status).toBe(200);
    expect(Array.isArray(await list.json())).toBe(true);
  });
});
