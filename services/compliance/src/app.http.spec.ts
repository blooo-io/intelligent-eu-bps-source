import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ComplianceService } from "./compliance/compliance.service.js";

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

  it("retention requires service principal (REQ-011)", async () => {
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

    const policyDenied = await fetch(`${base}/internal/v1/retention-policy`);
    expect(policyDenied.status).toBe(401);
    const policy = await fetch(`${base}/internal/v1/retention-policy`, {
      headers: { "x-intelligent-roles": "service" },
    });
    expect(policy.status).toBe(200);
    expect(await policy.json()).toMatchObject({
      personalRetentionDays: 1,
      invoiceRetentionYears: 10,
      kycLogRetentionYears: 5,
    });
  });
});