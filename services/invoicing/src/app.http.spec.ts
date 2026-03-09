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
      tradeIds: ["0x1"],
      pairSettlementId: created!.settlementId,
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

  it("POST invoices:from-settlement creates invoice with trade lineage (INT-196 / UAT-028)", async () => {
    const body = {
      settlementId: "s5555555-5555-4555-8555-555555555555",
      runId: "r5555555-5555-4555-8555-555555555555",
      consumerId: "11111111-2222-4333-8444-555555555555",
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8"],
      kWh: "10.00",
      energyAmount: "2.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1.00",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    };
    const denied = await fetch(`${base}/internal/v1/invoices:from-settlement`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(denied.status).toBe(401);

    const created = await fetch(`${base}/internal/v1/invoices:from-settlement`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify(body),
    });
    expect(created.status).toBe(201);
    const json = (await created.json()) as {
      invoiceId: string;
      tradeIds: string[];
      pairSettlementId: string;
      legalNumber?: string;
      hostedInvoiceUrl?: string;
    };
    expect(json.tradeIds).toEqual(body.tradeIds);
    expect(json.pairSettlementId).toBe(body.settlementId);
    expect(json.legalNumber).toBeTruthy();
  });

  it("POST invoices:from-settlement skips zero-amount carry-forward (INT-196 / BR-05)", async () => {
    const zero = {
      settlementId: "s6666666-6666-4666-8666-666666666666",
      runId: "r6666666-6666-4666-8666-666666666666",
      consumerId: "11111111-2222-4333-8444-555555555555",
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0xcarry"],
      kWh: "0.10",
      energyAmount: "0.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1.00",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    };
    const res = await fetch(`${base}/internal/v1/invoices:from-settlement`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify(zero),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      skipped: true,
      settlementId: zero.settlementId,
      reason: "zero_amount_carry_forward",
    });
  });

  it("lists and reads invoices for the member (INT-193 / REQ-007)", async () => {
    const consumerId = "11111111-2222-4333-8444-555555555555";
    const created = await service.createFromSettlement({
      settlementId: "s4444444-4444-4444-8444-444444444444",
      runId: "r4444444-4444-4444-8444-444444444444",
      consumerId,
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0x3"],
      kWh: "2.00",
      energyAmount: "2.00",
      vat: "0.40",
      currency: "EUR",
      rate: "1.00",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    const list = await fetch(`${base}/v1/me/invoices`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-sub": consumerId,
      },
    });
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Array<{ invoiceId: string }>;
    expect(rows.map((r) => r.invoiceId)).toContain(created!.invoiceId);

    const detail = await fetch(`${base}/v1/invoices/${created!.invoiceId}`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-sub": consumerId,
      },
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      invoiceId: created!.invoiceId,
      amounts: { total: "2.40" },
    });
  });

  it("UAT-055 — only manager can set invoice status with reason", async () => {
    const created = await service.createFromSettlement({
      settlementId: "s3333333-3333-4333-8333-333333333333",
      runId: "r3333333-3333-4333-8333-333333333333",
      consumerId: "11111111-2222-4333-8444-555555555555",
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0x2"],
      kWh: "1.00",
      energyAmount: "1.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1.00",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    const memberDenied = await fetch(
      `${base}/v1/invoices/${created!.invoiceId}/status`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "member",
          "x-intelligent-sub": "member-1",
        },
        body: JSON.stringify({ status: "Paid", reason: "cash" }),
      },
    );
    expect(memberDenied.status).toBe(403);

    const ok = await fetch(`${base}/v1/invoices/${created!.invoiceId}/status`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "manager",
        "x-intelligent-sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "x-intelligent-community": "c0ffee00-1234-4abc-8def-0123456789ab",
      },
      body: JSON.stringify({
        status: "Paid",
        reason: "paid outside the platform",
      }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      invoiceId: created!.invoiceId,
      status: "Paid",
    });
  });
});
