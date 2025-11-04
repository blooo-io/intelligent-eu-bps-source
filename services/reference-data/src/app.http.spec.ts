/**
 * INT-102 — HTTP surface matches internal OpenAPI paths (serviceAuth).
 */
import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";

describe("reference-data HTTP (INT-102)", () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const server = app.getHttpServer();
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open for probes", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; module: string };
    expect(body).toEqual({ status: "ok", module: "reference-data" });
  });

  it("GET /internal/v1/rates requires a service principal", async () => {
    const denied = await fetch(
      `${base}/internal/v1/rates?currency=CHF&date=2026-11-30`,
    );
    expect(denied.status).toBe(401);

    const res = await fetch(
      `${base}/internal/v1/rates?currency=CHF&date=2026-11-30`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currency: string; source: string };
    expect(body.currency).toBe("CHF");
    expect(body.source).toBe("ECB");
  });

  it("GET /internal/v1/communities/:id/vat-rate returns BR-07 default", async () => {
    const res = await fetch(
      `${base}/internal/v1/communities/c0ffee00-1234-4abc-8def-0123456789ab/vat-rate`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      vatRate: "0.00",
    });
  });

  it("POST /internal/v1/rates:fetch returns 202", async () => {
    const res = await fetch(`${base}/internal/v1/rates:fetch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ date: "2026-11-28" }),
    });
    expect(res.status).toBe(202);
  });
});
