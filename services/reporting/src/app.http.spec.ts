import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ReportingService } from "./reporting/reporting.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const PERIOD = "2026-09";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "22222222-2222-4333-8444-555555555555";
const INV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("reporting HTTP (INT-112)", () => {
  let app: INestApplication;
  let base: string;
  let service: ReportingService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(ReportingService);
  });

  beforeEach(() => {
    service.resetStore();
    service.projectInvoice({
      invoiceId: INV,
      communityId: COMMUNITY,
      producerId: PRODUCER,
      consumerId: CONSUMER,
      period: PERIOD,
      currency: "EUR",
      status: "Open",
      total: "10.00",
      tradeIds: ["t1"],
      energyKwh: "4.50",
    });
    service.projectPayment({
      paymentId: "cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee",
      invoiceId: INV,
      communityId: COMMUNITY,
      amount: "10.00",
      currency: "EUR",
      status: "succeeded",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "reporting" });
  });

  it("internal build and KPI export require service (REQ-018/032/047)", async () => {
    const buildDenied = await fetch(`${base}/internal/v1/reports:build`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ communityId: COMMUNITY, period: PERIOD }),
    });
    expect(buildDenied.status).toBe(401);

    const build = await fetch(`${base}/internal/v1/reports:build`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ communityId: COMMUNITY, period: PERIOD }),
    });
    expect(build.status).toBe(202);

    const exportKpi = await fetch(`${base}/internal/v1/kpi-exports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ communityId: COMMUNITY, period: PERIOD }),
    });
    expect(exportKpi.status).toBe(202);
  });
});