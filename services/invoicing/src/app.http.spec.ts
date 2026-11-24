import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { StatementStore } from "./domain/statement-store.js";
import { InvoiceStore } from "./domain/store.js";
import type { InvoiceRecord } from "./domain/types.js";
import { InvoicingService } from "./invoicing/invoicing.service.js";
import { StatementsService } from "./invoicing/statements.service.js";

const COM = "c0ffee00-1234-4abc-8def-0123456789ab";
const P = "70000000-0000-4000-8000-000000000001";
const A = "70000000-0000-4000-8000-000000000002";
const B = "70000000-0000-4000-8000-000000000003";
const C = "70000000-0000-4000-8000-000000000004";

const STATEMENT_FIELDS = [
  "communityId",
  "currency",
  "direction",
  "invoiceIds",
  "netBalance",
  "participantId",
  "period",
  "periodFrom",
  "periodUntil",
  "revision",
  "statementId",
  "status",
  "totalBought",
  "totalSold",
];

const statementInvoice = (
  invoiceId: string,
  consumerId: string,
  producerId: string,
  total: string,
): InvoiceRecord => ({
  invoiceId,
  settlementId: `5e000000-0000-4000-8000-${invoiceId.slice(-12)}`,
  runId: "R1",
  period: "2026-10",
  periodFrom: "2026-10-01T00:00:00.000Z",
  periodUntil: "2026-11-01T00:00:00.000Z",
  producerId,
  consumerId,
  currency: "EUR",
  status: "Open",
  total,
  tradeIds: [],
  lines: [],
  legalNumber: null,
  energyAmount: total,
  vatAmount: "0.00",
  dueDate: "2026-11-15",
  communityId: COM,
  statusAudit: [],
});

const memberHeaders = (sub: string) => ({
  "x-intelligent-roles": "member",
  "x-intelligent-sub": sub,
});
const serviceHeaders = { "x-intelligent-roles": "service" };

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

  it("UAT seed invoice is listed for hugo.petit IdP sub (INT-218)", async () => {
    const list = await fetch(`${base}/v1/me/invoices`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-sub": "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f",
      },
    });
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Array<{
      invoiceId: string;
      status: string;
      amounts: { total: string };
    }>;
    expect(rows.some((r) => r.invoiceId === "c0a1b2c3-d4e5-4f60-8a70-b8c9d0e1f203")).toBe(
      true,
    );
    const seeded = rows.find(
      (r) => r.invoiceId === "c0a1b2c3-d4e5-4f60-8a70-b8c9d0e1f203",
    )!;
    expect(seeded.status).toBe("Paid");
    expect(seeded.amounts.total).toBe("22.00");
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
      rate: "1.0000",
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

    // INT-238 — by-settlement lookup (NATS smoke poll).
    const bySettlement = await fetch(
      `${base}/internal/v1/invoices:by-settlement/${created!.settlementId}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(bySettlement.status).toBe(200);
    expect(await bySettlement.json()).toMatchObject({
      invoiceId: created!.invoiceId,
      pairSettlementId: created!.settlementId,
    });
    const missing = await fetch(
      `${base}/internal/v1/invoices:by-settlement/00000000-0000-4000-8000-000000000099`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(missing.status).toBe(404);

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
      rate: "1.0000",
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
    };
    expect(json.tradeIds).toEqual(body.tradeIds);
    expect(json.pairSettlementId).toBe(body.settlementId);
    expect(json.legalNumber).toMatch(/^SB-66666666-\d{6}$/);
    expect(json).not.toHaveProperty("producerStripeAccountId");
    expect(json).not.toHaveProperty("hostedInvoiceUrl");
    expect(json).not.toHaveProperty("stripeInvoiceId");
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
      rate: "1.0000",
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
      rate: "1.0000",
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
      rate: "1.0000",
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

  // UAT-060 — a manager may change status only inside their community (REQ-049).
  it("UAT-060 — manager of another community cannot set invoice status (REQ-049)", async () => {
    const created = await service.createFromSettlement({
      settlementId: "s5555555-5555-4555-8555-555555555555",
      runId: "r5555555-5555-4555-8555-555555555555",
      consumerId: "11111111-2222-4333-8444-555555555555",
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0x5"],
      kWh: "1.00",
      energyAmount: "1.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1.0000",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });

    const denied = await fetch(
      `${base}/v1/invoices/${created!.invoiceId}/status`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "manager",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "x-intelligent-community": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
        body: JSON.stringify({
          status: "Void",
          reason: "wrong community",
        }),
      },
    );
    expect(denied.status).toBe(404);
    expect(service.getInvoice(created!.invoiceId).status).toBe("Open");
  });

  it("GET invoice document returns PDF bytes (REQ-039 / A6)", async () => {
    const consumerId = "11111111-2222-4333-8444-555555555555";
    const created = await service.createFromSettlement({
      settlementId: "s7777777-7777-4777-8777-777777777777",
      runId: "r7777777-7777-4777-8777-777777777777",
      consumerId,
      producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      tradeIds: ["0xpdf"],
      kWh: "1.00",
      energyAmount: "1.00",
      vat: "0.00",
      currency: "EUR",
      rate: "1.0000",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
    const res = await fetch(
      `${base}/v1/invoices/${created!.invoiceId}/document`,
      {
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-sub": consumerId,
        },
        redirect: "manual",
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(
      `${created!.legalNumber}.pdf`,
    );
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });

  it("A6 invoicing has no Stripe dependency", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const root = resolve(import.meta.dirname, "..");
    const pkg = readFileSync(resolve(root, "package.json"), "utf8");
    expect(pkg).not.toMatch(/"stripe"/);
    expect(existsSync(resolve(root, "src/stripe"))).toBe(false);
  });

  describe("statements (REQ-059)", () => {
    beforeEach(async () => {
      app.get(StatementStore).reset();
      // Run R1, period 2026-10: A→P 12.00, B→P 8.50, P→C 6.25 (consumer → producer).
      const invoices = app.get(InvoiceStore);
      invoices.put(statementInvoice("1a000000-0000-4000-8000-000000000001", A, P, "12.00"));
      invoices.put(statementInvoice("1a000000-0000-4000-8000-000000000002", B, P, "8.50"));
      invoices.put(statementInvoice("1a000000-0000-4000-8000-000000000003", P, C, "6.25"));
      await app.get(StatementsService).issueStatementsForRun("R1");
    });

    it("REQ-059 / REQ-010: GET /v1/me/statements returns only the caller's statements", async () => {
      const res = await fetch(`${base}/v1/me/statements`, { headers: memberHeaders(P) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body.map((s) => s.participantId)).toEqual([P]);
      expect(body[0]).toMatchObject({ direction: "to_receive", netBalance: "14.25" });
      // Public Statement schema has additionalProperties: false.
      expect(Object.keys(body[0]!).sort()).toEqual(STATEMENT_FIELDS);
    });

    it("REQ-059: GET /v1/me/statements requires a member principal", async () => {
      expect((await fetch(`${base}/v1/me/statements`)).status).toBe(401);
    });

    it("internal listStatements includes invoice summaries and requires a service principal", async () => {
      expect((await fetch(`${base}/internal/v1/statements?participantId=${P}`)).status).toBe(401);
      expect(
        (
          await fetch(`${base}/internal/v1/statements?participantId=${P}`, {
            headers: memberHeaders(P),
          })
        ).status,
      ).toBe(403);

      const res = await fetch(
        `${base}/internal/v1/statements?participantId=${P}&period=2026-10`,
        { headers: serviceHeaders },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown> & { invoices: unknown[] }>;
      expect(body[0]!.invoices).toHaveLength(3);
      expect(body[0]!.invoices[0]).toEqual({
        invoiceId: "1a000000-0000-4000-8000-000000000001",
        producerId: P,
        consumerId: A,
        total: "12.00",
        status: "Open",
      });
      // InternalStatement schema has additionalProperties: false.
      expect(Object.keys(body[0]!).sort()).toEqual([...STATEMENT_FIELDS, "invoices"].sort());
    });

    it("REQ-049: internal listStatements is open to the operator and filters by period", async () => {
      const res = await fetch(
        `${base}/internal/v1/statements?participantId=${P}&period=2026-09`,
        { headers: { "x-intelligent-roles": "operator" } },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("internal listStatements rejects a request without participantId", async () => {
      const res = await fetch(`${base}/internal/v1/statements`, { headers: serviceHeaders });
      expect(res.status).toBe(400);
    });
  });

  it("GET seeded invoice document is an inline PDF (INT-218)", async () => {
    const res = await fetch(
      `${base}/v1/invoices/c0a1b2c3-d4e5-4f60-8a70-b8c9d0e1f203/document`,
      {
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-sub": "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f",
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
