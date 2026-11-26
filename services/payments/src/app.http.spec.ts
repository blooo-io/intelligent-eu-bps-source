import "reflect-metadata";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { OutboxService } from "@intelligent/module-template";
import { AppModule } from "./app.module.js";
import { PaymentsStore } from "./domain/store.js";
import { KycService } from "./kyc/kyc.service.js";
import { PaymentsService } from "./payments/payments.service.js";
import { PayoutsService } from "./payouts/payouts.service.js";
import { InMemoryCommunitySettings } from "./ports/community-settings.port.js";
import { InMemoryInvoiceLookup } from "./ports/invoice-lookup.port.js";
import { InMemoryStatementLookup } from "./ports/statement-lookup.port.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const INVOICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MANAGER = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const DUMMY_UUID = "00000000-0000-4000-8000-000000000001";

const SERVICE_HEADERS = {
  "content-type": "application/json",
  "x-intelligent-roles": "service",
} as const;

/** Paths under `paths:` in contracts/openapi/internal/payments.v1.yaml. */
function listInternalPaymentsOpenApiPaths(): string[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const text = readFileSync(
    join(root, "contracts/openapi/internal/payments.v1.yaml"),
    "utf8",
  );
  const paths: string[] = [];
  let inPaths = false;
  for (const line of text.split("\n")) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^[A-Za-z]/.test(line)) break;
    if (!inPaths) continue;
    const match = line.match(/^  (\/.*?):\s*$/);
    if (match?.[1]) paths.push(match[1]);
  }
  return paths;
}

function openApiPathToUrl(path: string): string {
  return `/internal/v1${path.replace(/\{[^}]+\}/g, DUMMY_UUID)}`;
}

function openApiPathMethods(path: string): string[] {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const text = readFileSync(
    join(root, "contracts/openapi/internal/payments.v1.yaml"),
    "utf8",
  );
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `  ${path}:`);
  if (start < 0) return [];
  const methods: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^  \//.test(line) || /^[A-Za-z]/.test(line)) break;
    const m = line.match(/^    (get|post|put|patch|delete):\s*$/i);
    if (m) methods.push(m[1]!.toUpperCase());
  }
  return methods;
}

describe("payments HTTP (INT-107)", () => {
  let app: INestApplication;
  let base: string;
  let service: PaymentsService;
  let kyc: KycService;
  let invoices: InMemoryInvoiceLookup;

  /** REQ-045 — payInvoice requires verified KYC on payer and payee. */
  async function verifyKyc(participantId: string): Promise<void> {
    await kyc.applyAccountSession(
      participantId,
      { mode: "embedded", status: "complete", payoutsEnabled: true },
      "operator",
      null,
    );
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(PaymentsService);
    kyc = app.get(KycService);
    invoices = app.get(InMemoryInvoiceLookup);
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
    expect(await res.json()).toEqual({ status: "ok", module: "payments" });
  });

  it("D2 / REQ-014 connected-customers:ensure is gone (INT-428)", async () => {
    const res = await fetch(`${base}/internal/v1/connected-customers:ensure`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({
        participantId: CONSUMER,
        pspAccountRef: "acct_test_p1",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("internal GetPaymentAccount + provision (INT-228)", async () => {
    const missing = await fetch(
      `${base}/internal/v1/payment-accounts/${PRODUCER}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(missing.status).toBe(404);

    const provision = await fetch(
      `${base}/internal/v1/payment-accounts:provision`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "service,operator",
        },
        body: JSON.stringify({
          participantId: PRODUCER,
          communityId: COMMUNITY,
          role: "producer",
          fresh: true,
        }),
      },
    );
    expect(provision.status).toBe(201);
    const created = await provision.json();
    expect(created.pspAccountRef).toMatch(/^acct_test_/);

    const got = await fetch(
      `${base}/internal/v1/payment-accounts/${PRODUCER}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({
      participantId: PRODUCER,
      pspAccountRef: created.pspAccountRef,
    });
  });



  it("webhook accepts signed provider events", async () => {
    const body = JSON.stringify({
      eventId: "evt_http_ping",
      kind: "ignored",
      occurredAt: "2026-11-24T10:00:00.000Z",
    });
    const bad = await fetch(`${base}/webhooks/payment-provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(bad.status).toBe(401);

    const invalid = await fetch(`${base}/webhooks/payment-provider`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=deadbeef",
      },
      body,
    });
    expect(invalid.status).toBe(400);

    const ok = await fetch(`${base}/webhooks/payment-provider`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": MockPspAdapter.sign(body),
      },
      body,
    });
    expect(ok.status).toBe(204);
  });





  describe("internal payouts (REQ-015)", () => {
    const SERVICE_HEADERS = {
      "content-type": "application/json",
      "x-intelligent-roles": "service",
    } as const;

    beforeEach(async () => {
      app.get(PayoutsService).resetStore();
      const statements = app.get(InMemoryStatementLookup);
      statements.reset();
      const store = app.get(PaymentsStore);
      store.putAccount({
        participantId: PRODUCER,
        pspAccountRef: "acct_test_payout_http",
        pspPaymentMethodRef: null,
        kycStatus: "verified",
        role: "producer",
        communityId: COMMUNITY,
        kycVerified: true,
        kycVerifiedAt: "2026-11-25T10:00:00.000Z",
        kycMethod: "connect_onboarding",
        payoutAccountVerified: true,
      });
      const paid = (invoiceId: string, total: string) => ({
        invoiceId,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        total,
        status: "Paid",
      });
      statements.put({
        participantId: PRODUCER,
        period: "2026-10",
        currency: "EUR",
        invoices: [paid("iA", "12.00"), paid("iB", "8.50")],
      });
      statements.put({ participantId: PRODUCER, period: "2026-11", currency: "EUR", invoices: [paid("iD", "5.00")] });
      for (const [invoiceId, amount, fee] of [
        ["iA", "12.00", "0.43"],
        ["iB", "8.50", "0.37"],
        ["iD", "5.00", "0.20"],
      ]) {
        store.putPayment({
          paymentId: `pay-${invoiceId}`,
          invoiceId,
          participantId: CONSUMER,
          payeeId: PRODUCER,
          amount,
          currency: "EUR",
          status: "succeeded",
          communityId: COMMUNITY,
          feeAmount: fee,
        });
      }
      await app.get(MockPspAdapter).fundBalance("acct_test_payout_http", "25.00", "EUR");
    });

    it("POST /internal/v1/payouts:request withdraws the earliest open period", async () => {
      const res = await fetch(`${base}/internal/v1/payouts:request`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({ actorId: PRODUCER, currency: "EUR" }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        payoutStatus: "in_transit",
        amount: "19.70",
        currency: "EUR",
        payoutId: expect.any(String),
      });
    });

    it("INT-465: POST payouts:request is idempotent once every period is already paid out", async () => {
      const ask = () =>
        fetch(`${base}/internal/v1/payouts:request`, {
          method: "POST",
          headers: SERVICE_HEADERS,
          body: JSON.stringify({ actorId: PRODUCER, currency: "EUR" }),
        });
      // Two eligible periods in beforeEach — drain both, then replay.
      expect((await ask()).status).toBe(200);
      const lastFresh = await ask();
      expect(lastFresh.status).toBe(200);
      const last = (await lastFresh.json()) as { payoutId: string; payoutStatus: string; amount: string };
      const replay = await ask();
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({
        payoutId: last.payoutId,
        payoutStatus: last.payoutStatus,
        amount: last.amount,
        currency: "EUR",
      });
    });

    it("POST /internal/v1/payouts:run-auto pays out when autoPayout is on (202)", async () => {
      const runAuto = (body: unknown, roles = "service") =>
        fetch(`${base}/internal/v1/payouts:run-auto`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-intelligent-roles": roles },
          body: JSON.stringify(body),
        });
      const settings = app.get(InMemoryCommunitySettings);
      settings.put(COMMUNITY, { autoPayout: true });
      const on = await runAuto({ communityId: COMMUNITY });
      expect(on.status).toBe(202);
      expect(await on.json()).toMatchObject({ requested: 2, blocked: 0 });
      settings.reset();
    });

    it("payout.paid webhook marks payout paid; replay is ignored", async () => {
      const res = await fetch(`${base}/internal/v1/payouts:request`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({ actorId: PRODUCER, currency: "EUR" }),
      });
      const { payoutId } = (await res.json()) as { payoutId: string };
      const payouts = app.get(PayoutsService);
      const [record] = (await payouts.listForParticipant(PRODUCER)).items;
      const append = vi.spyOn(app.get(OutboxService), "append");
      const body = JSON.stringify({
        eventId: `evt_payout_paid_${payoutId}`,
        kind: "payout.paid",
        occurredAt: "2026-11-26T08:00:00.000Z",
        pspAccountRef: "acct_test_payout_http",
        pspPayoutRef: record!.pspPayoutRef,
      });
      const send = () =>
        fetch(`${base}/webhooks/payment-provider`, {
          method: "POST",
          headers: { "content-type": "application/json", "stripe-signature": MockPspAdapter.sign(body) },
          body,
        });
      expect((await send()).status).toBe(204);
      expect((await send()).status).toBe(204);
      const paidEvents = append.mock.calls.filter(
        ([e]) => e.type === "PayoutStatusChanged" && (e.data as { status: string }).status === "paid",
      );
      expect(paidEvents).toHaveLength(1);
      append.mockRestore();
    });
  });

  describe("EWDS command targets (INT-440 / A7-bis)", () => {
    const prevAllow = process.env.KYC_RETURN_URL_ALLOWLIST;

    beforeAll(() => {
      process.env.KYC_RETURN_URL_ALLOWLIST = "https://ui.example";
    });

    afterAll(() => {
      if (prevAllow === undefined) delete process.env.KYC_RETURN_URL_ALLOWLIST;
      else process.env.KYC_RETURN_URL_ALLOWLIST = prevAllow;
    });

    beforeEach(async () => {
      await service.ensureParticipant({
        participantId: CONSUMER,
        communityId: COMMUNITY,
        role: "consumer",
      });
      await service.ensureParticipant({
        participantId: PRODUCER,
        communityId: COMMUNITY,
        role: "producer",
      });
      await verifyKyc(CONSUMER);
      await verifyKyc(PRODUCER);
    });

    it("POST /internal/v1/payments:start returns paymentId/status (off-session card)", async () => {
      await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
      invoices.put({
        invoiceId: INVOICE,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        currency: "EUR",
        status: "Open",
        total: "3.00",
        producerPspAccountRef: "acct_test_cmd_pay",
      });
      const res = await fetch(`${base}/internal/v1/payments:start`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          invoiceId: INVOICE,
          actorId: CONSUMER,
          surface: "hosted",
          returnUrl: "https://ui.example/return",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        paymentId: expect.any(String),
        status: "succeeded",
      });
    });

    it("POST /internal/v1/payments:start returns hosted checkout handoff for SEPA", async () => {
      await service.attachPaymentMethod(CONSUMER, "pm_sepa_debit");
      invoices.put({
        invoiceId: INVOICE,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        currency: "EUR",
        status: "Open",
        total: "4.50",
        producerPspAccountRef: "acct_test_cmd_sepa",
      });
      const res = await fetch(`${base}/internal/v1/payments:start`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          invoiceId: INVOICE,
          actorId: CONSUMER,
          surface: "hosted",
          returnUrl: "https://ui.example/return",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        paymentId: expect.any(String),
        status: "requires_action",
        handoff: {
          surface: "hosted",
          provider: "stripe",
          purpose: "checkout",
          url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//),
        },
      });
    });

    it("POST /internal/v1/payments:start returns embedded PaymentIntent handoff (A7-bis)", async () => {
      invoices.put({
        invoiceId: INVOICE,
        producerId: PRODUCER,
        consumerId: CONSUMER,
        currency: "EUR",
        status: "Open",
        total: "5.25",
        producerPspAccountRef: "acct_test_cmd_emb",
      });
      const res = await fetch(`${base}/internal/v1/payments:start`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          invoiceId: INVOICE,
          actorId: CONSUMER,
          surface: "embedded",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        paymentId: expect.any(String),
        status: "requires_action",
        handoff: {
          surface: "embedded",
          provider: "stripe",
          purpose: "payment",
          clientSecret: expect.stringMatching(/_secret/),
          connectedAccountRef: "acct_test_cmd_emb",
          publishableKey: expect.stringMatching(/^pk_test_/),
        },
      });
    });

    it("POST /internal/v1/kyc:start connect_account returns hosted Connect handoff", async () => {
      const fresh = "cccccccc-dddd-4eee-8fff-000000000001";
      await service.ensureParticipant({
        participantId: fresh,
        communityId: COMMUNITY,
        role: "producer",
      });
      const res = await fetch(`${base}/internal/v1/kyc:start`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          actorId: fresh,
          kind: "connect_account",
          surface: "hosted",
          returnUrl: "https://ui.example/kyc",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        surface: "hosted",
        provider: "stripe",
        purpose: "connect_onboarding",
        url: expect.stringMatching(/^https:\/\/connect\.stripe\.com\//),
      });
    });

    it("POST /internal/v1/kyc:start identity returns hosted Identity handoff", async () => {
      await service.ensureParticipant({
        participantId: MANAGER,
        communityId: COMMUNITY,
        role: "consumer",
      });
      const res = await fetch(`${base}/internal/v1/kyc:start`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          actorId: MANAGER,
          kind: "identity",
          surface: "hosted",
          returnUrl: "https://ui.example/kyc",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        surface: "hosted",
        provider: "stripe",
        purpose: "identity",
        url: expect.stringMatching(/^https:\/\/verify\.stripe\.com\//),
      });
    });

    it("POST /internal/v1/payment-methods:setup returns embedded setup handoff", async () => {
      const res = await fetch(`${base}/internal/v1/payment-methods:setup`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          actorId: CONSUMER,
          surface: "embedded",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        handoff: {
          surface: "embedded",
          provider: "stripe",
          purpose: "setup",
          publishableKey: expect.stringMatching(/^pk_test_/),
          clientSecret: expect.stringMatching(/^seti_test_/),
        },
      });
    });

    // INT-461 — S9 fixture: bind pm_card_chargeDeclined before payments:start.
    it("POST /internal/v1/payment-methods:attach binds a payment-method token", async () => {
      const seeded = await fetch(
        `${base}/internal/v1/payment-accounts:provision`,
        {
          method: "POST",
          headers: SERVICE_HEADERS,
          body: JSON.stringify({
            participantId: CONSUMER,
            communityId: COMMUNITY,
            role: "consumer",
          }),
        },
      );
      expect(seeded.status).toBe(201);
      const res = await fetch(`${base}/internal/v1/payment-methods:attach`, {
        method: "POST",
        headers: SERVICE_HEADERS,
        body: JSON.stringify({
          participantId: CONSUMER,
          paymentMethodId: "pm_card_chargeDeclined",
        }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        participantId: CONSUMER,
        paymentMethodId: "pm_card_chargeDeclined",
        status: "complete",
      });
      const account = await fetch(
        `${base}/internal/v1/payment-accounts/${CONSUMER}`,
        { headers: SERVICE_HEADERS },
      );
      expect(await account.json()).toMatchObject({
        paymentMethodId: "pm_card_chargeDeclined",
      });
    });

    it("every path in the internal payments OpenAPI has a controller route", async () => {
      const paths = listInternalPaymentsOpenApiPaths();
      expect(paths.length).toBeGreaterThanOrEqual(10);
      expect(paths).toEqual(
        expect.arrayContaining([
          "/payments:start",
          "/payouts:request",
          "/kyc:start",
          "/payment-methods:setup",
          "/payment-methods:attach",
        ]),
      );

      for (const path of paths) {
        const methods = openApiPathMethods(path);
        expect(methods.length, path).toBeGreaterThan(0);
        const url = `${base}${openApiPathToUrl(path)}`;
        for (const method of methods) {
          const res = await fetch(url, {
            method,
            headers: SERVICE_HEADERS,
            body: method === "GET" || method === "HEAD" ? undefined : "{}",
          });
          // Handler 404 (unknown id) is fine; Express "Cannot METHOD …" means no route.
          if (res.status === 404) {
            const body = (await res.json()) as { message?: string | string[] };
            const message = Array.isArray(body.message)
              ? body.message.join(" ")
              : String(body.message ?? "");
            expect(
              message,
              `${method} ${path} missing controller route`,
            ).not.toMatch(/^Cannot (GET|POST|PUT|PATCH|DELETE) /i);
          }
        }
      }
    });
  });
});
