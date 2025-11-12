import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { InvoicingService } from "./invoicing/invoicing.service.js";

describe("invoicing HTTP (INT-106)", () => {
  let app: INestApplication;
  let base: string;
  let service: InvoicingService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(InvoicingService);
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
    expect(await res.json()).toEqual({ status: "ok", module: "invoicing" });
  });

  it("getInvoice and markOverdue require service principal", async () => {
    const created = await service.createFromSettlement({
      settlementId: "s2222222-2222-4222-8222-222222222222",
      runId: "r2222222-2222-4222-8222-222222222222",
      consumerId: "11111111-2222-4333-8444-555555555555",
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0x1"],
      kWh: "1.00",
      energyAmount: "1.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1.00",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    const denied = await fetch(
      `${base}/internal/v1/invoices/${created!.invoiceId}`,
    );
    expect(denied.status).toBe(401);

    const get = await fetch(
      `${base}/internal/v1/invoices/${created!.invoiceId}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      invoiceId: created!.invoiceId,
      status: "Open",
      total: "1.00",
    });

    const overdue = await fetch(`${base}/internal/v1/invoices:mark-overdue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ asOf: "2099-01-01" }),
    });
    expect(overdue.status).toBe(202);
  });
});
