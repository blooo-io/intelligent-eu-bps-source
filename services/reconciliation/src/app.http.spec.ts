import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ReconciliationService } from "./reconciliation/reconciliation.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("reconciliation HTTP (INT-108)", () => {
  let app: INestApplication;
  let base: string;
  let service: ReconciliationService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(ReconciliationService);
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
    expect(await res.json()).toEqual({ status: "ok", module: "reconciliation" });
  });

  it("reconcile requires service principal and lists discrepancies for operator (REQ-041)", async () => {
    service.projectInvoice({
      invoiceId: "inv-missing",
      total: "1.00",
      currency: "EUR",
      communityId: COMMUNITY,
      status: "Open",
    });
    service.projectMarket({
      marketId: "mkt-1",
      communityId: COMMUNITY,
      expectedNumTrades: 2,
      expectedTradedQuantityKWh: "8.00",
      actualNumTrades: 1,
      actualTradedQuantityKWh: "4.00",
    });

    const denied = await fetch(`${base}/internal/v1/reconciliation:run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "invoice" }),
    });
    expect(denied.status).toBe(401);

    const invoiceRun = await fetch(`${base}/internal/v1/reconciliation:run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ scope: "invoice", communityId: COMMUNITY }),
    });
    expect(invoiceRun.status).toBe(202);

    const marketRun = await fetch(`${base}/internal/v1/reconciliation:run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ scope: "market", communityId: COMMUNITY }),
    });
    expect(marketRun.status).toBe(202);

    const deniedList = await fetch(`${base}/v1/reconciliation/discrepancies`);
    expect(deniedList.status).toBe(401);

    const list = await fetch(
      `${base}/v1/reconciliation/discrepancies?communityId=${COMMUNITY}`,
      { headers: { "x-intelligent-roles": "operator" } },
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as Array<{ scope: string }>;
    expect(body.some((d) => d.scope === "invoice")).toBe(true);
    expect(body.some((d) => d.scope === "market")).toBe(true);
  });
});
