import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { OutboxService } from "@intelligent/module-template";
import { AppModule } from "./app.module.js";
import { PaymentsStore } from "./domain/store.js";
import { PaymentsService } from "./payments/payments.service.js";
import { PayoutsService } from "./payouts/payouts.service.js";
import { InMemoryInvoiceLookup } from "./ports/invoice-lookup.port.js";
import { InMemoryStatementLookup } from "./ports/statement-lookup.port.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const INVOICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("payments HTTP (INT-107)", () => {
  let app: INestApplication;
  let base: string;
  let service: PaymentsService;
  let invoices: InMemoryInvoiceLookup;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(PaymentsService);
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

  it("UAT-014 REQ-014 internal EnsureConnectedCustomer reuses one Customer per pair (INT-355)", async () => {
    const ensure = (body: unknown, roles = "service") =>
      fetch(`${base}/internal/v1/connected-customers:ensure`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": roles,
        },
        body: JSON.stringify(body),
      });
    const first = await ensure({ participantId: CONSUMER, pspAccountRef: "acct_test_p1" });
    expect(first.status).toBe(200);
    const created = (await first.json()) as { pspCustomerRef: string };
    expect(created).toMatchObject({
      participantId: CONSUMER,
      pspAccountRef: "acct_test_p1",
      pspCustomerRef: expect.stringMatching(/^cus_test_/),
    });
    const again = await ensure({ participantId: CONSUMER, pspAccountRef: "acct_test_p1" });
    expect(((await again.json()) as { pspCustomerRef: string }).pspCustomerRef).toBe(
      created.pspCustomerRef,
    );
    expect((await ensure({ participantId: CONSUMER, pspAccountRef: "bad" })).status).toBe(400);
    expect(
      (await ensure({ participantId: CONSUMER, pspAccountRef: "acct_test_p1" }, "member")).status,
    ).toBe(403);
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

  it("onboarding and pay require member principal", async () => {
    const denied = await fetch(`${base}/v1/me/payment-account/onboarding`, {
      method: "POST",
    });
    expect(denied.status).toBe(401);

    const onboarding = await fetch(`${base}/v1/me/payment-account/onboarding`, {
      method: "POST",
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(onboarding.status).toBe(200);
    expect(await onboarding.json()).toMatchObject({
      mode: "elements",
      clientSecret: expect.stringMatching(/^seti_test_/),
    });

    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");
    invoices.put({
      invoiceId: INVOICE,
      pspInvoiceRef: "in_test_http",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerPspAccountRef: "acct_test_producer",
    });

    const pay = await fetch(`${base}/v1/invoices/${INVOICE}/payments`, {
      method: "POST",
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(pay.status).toBe(201);
    expect(await pay.json()).toMatchObject({ status: "succeeded", amount: "2.00" });
  });

  it("UAT-057 REQ-014 pay forwards returnUrl to the hosted SEPA checkout (INT-425)", async () => {
    await service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_sepa_debit");
    invoices.put({
      invoiceId: INVOICE,
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "4.00",
      producerPspAccountRef: "mock_acct_http",
    });
    const headers = {
      "content-type": "application/json",
      "x-intelligent-roles": "member",
      "x-intelligent-token-use": "user",
      "x-intelligent-sub": CONSUMER,
      "x-intelligent-community": COMMUNITY,
    };
    const missing = await fetch(`${base}/v1/invoices/${INVOICE}/payments`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    const pay = await fetch(`${base}/v1/invoices/${INVOICE}/payments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ returnUrl: "https://ewds.example/return" }),
    });
    expect(pay.status).toBe(201);
    expect(await pay.json()).toMatchObject({
      status: "requires_action",
      checkoutUrl: expect.stringMatching(/^https:\/\//),
      initiatedAt: expect.any(String),
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

  it("attaches consumer payment method over HTTP (INT-193)", async () => {
    const missing = await fetch(`${base}/v1/me/payment-account/payment-method`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    const ok = await fetch(`${base}/v1/me/payment-account/payment-method`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ paymentMethodId: "pm_card_visa" }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      mode: "elements",
      status: "complete",
    });
  });

  it("GET /v1/me/payment-account returns brand/last4 when Ready (INT-255)", async () => {
    const empty = await fetch(`${base}/v1/me/payment-account`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ status: "none" });

    await fetch(`${base}/v1/me/payment-account/payment-method`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
      body: JSON.stringify({ paymentMethodId: "pm_card_visa" }),
    });

    const ready = await fetch(`${base}/v1/me/payment-account`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-sub": CONSUMER,
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      status: "complete",
      brand: "visa",
      last4: "4242",
    });
  });

  it("submitRequirements falls back to request ip without x-forwarded-for", async () => {
    const producer = "66666666-7777-4888-9999-aaaaaaaaaaaa";
    await fetch(`${base}/v1/me/payment-account/onboarding`, {
      method: "POST",
      headers: {
        "x-intelligent-roles": "member,producer",
        "x-intelligent-sub": producer,
        "x-intelligent-community": COMMUNITY,
      },
    });
    const submit = await fetch(
      `${base}/v1/me/payment-account/onboarding/requirements`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "member,producer",
          "x-intelligent-sub": producer,
          "x-intelligent-community": COMMUNITY,
        },
        body: JSON.stringify({
          accountToken: "ct_test_no_xff",
          country: "FR",
          businessType: "individual",
          businessProfileUrl: "https://producer.example",
          businessProfileMcc: "5734",
          representative: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
          },
          externalAccount: {
            country: "FR",
            currency: "eur",
            accountNumber: "FR1420041010050500013M02606",
          },
          tosAccepted: true,
        }),
      },
    );
    expect(submit.status).toBe(200);
  });

  it("producer and prosumer onboarding use embedded Connect; legacy KYC submit still updates (INT-362 / INT-191)", async () => {
    const producer = "66666666-7777-4888-9999-aaaaaaaaaaaa";
    const res = await fetch(`${base}/v1/me/payment-account/onboarding`, {
      method: "POST",
      headers: {
        "x-intelligent-roles": "member,producer",
        "x-intelligent-sub": producer,
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(res.status).toBe(200);
    const started = await res.json();
    expect(started).toMatchObject({
      mode: "embedded",
      status: "requirements_due",
      pspAccountRef: expect.stringMatching(/^acct_test_/),
      clientSecret: expect.any(String),
    });

    const prosumer = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const res2 = await fetch(`${base}/v1/me/payment-account/onboarding`, {
      method: "POST",
      headers: {
        "x-intelligent-roles": "member,prosumer",
        "x-intelligent-sub": prosumer,
        "x-intelligent-community": COMMUNITY,
      },
    });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toMatchObject({
      mode: "embedded",
      status: "requirements_due",
    });

    const submit = await fetch(
      `${base}/v1/me/payment-account/onboarding/requirements`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "member,producer",
          "x-intelligent-sub": producer,
          "x-intelligent-community": COMMUNITY,
          "x-forwarded-for": "203.0.113.40",
        },
        body: JSON.stringify({
          accountToken: "ct_test_http",
          country: "FR",
          businessType: "individual",
          businessProfileUrl: "https://producer.example",
          businessProfileMcc: "5734",
          representative: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
          },
          externalAccount: {
            country: "FR",
            currency: "eur",
            accountNumber: "FR1420041010050500013M02606",
          },
          tosAccepted: true,
        }),
      },
    );
    expect(submit.status).toBe(200);
    expect(await submit.json()).toMatchObject({
      status: "complete",
      pspAccountRef: expect.stringMatching(/^acct_test_/),
    });
  });

  describe("member payouts (REQ-015, REQ-060, UAT-015)", () => {
    const memberHeaders = (sub: string) => ({
      "content-type": "application/json",
      "x-intelligent-roles": "member,producer",
      "x-intelligent-token-use": "user",
      "x-intelligent-sub": sub,
      "x-intelligent-community": COMMUNITY,
    });
    const withdraw = (period: unknown, sub = PRODUCER) =>
      fetch(`${base}/v1/me/payouts`, {
        method: "POST",
        headers: memberHeaders(sub),
        body: JSON.stringify({ period }),
      });

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

    it("UAT-015: POST /v1/me/payouts returns the contract Payout; a replay returns the same payout", async () => {
      const res = await withdraw("2026-10");
      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        ["amount", "currency", "participantId", "payoutId", "period", "requestedAt", "status", "trigger"],
      );
      expect(body).toMatchObject({
        participantId: PRODUCER,
        period: "2026-10",
        amount: "19.70",
        currency: "EUR",
        status: "in_transit",
        trigger: "participant",
      });
      const again = (await (await withdraw("2026-10")).json()) as { payoutId: string };
      expect(again.payoutId).toBe(body.payoutId);
    });

    it("GET /v1/me/payouts lists own payouts and withdrawable periods only (REQ-060)", async () => {
      await withdraw("2026-10");
      const res = await fetch(`${base}/v1/me/payouts`, { headers: memberHeaders(PRODUCER) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ participantId: string }>;
        withdrawable: unknown[];
      };
      expect(body.withdrawable).toEqual([{ period: "2026-11", amount: "4.80", currency: "EUR" }]);
      expect(body.items).toHaveLength(1);
      expect(body.items.every((p) => p.participantId === PRODUCER)).toBe(true);

      const other = (await (await fetch(`${base}/v1/me/payouts`, { headers: memberHeaders(CONSUMER) })).json()) as {
        items: unknown[];
      };
      expect(other).toEqual({ items: [], withdrawable: [] });
    });

    it("UAT-015: payout.paid webhook marks the payout paid and emits once; replay of the same event id is ignored", async () => {
      const { payoutId } = (await (await withdraw("2026-10")).json()) as { payoutId: string };
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
      const listed = (await (await fetch(`${base}/v1/me/payouts`, { headers: memberHeaders(PRODUCER) })).json()) as {
        items: Array<{ payoutId: string; status: string }>;
      };
      expect(listed.items).toEqual([expect.objectContaining({ payoutId, status: "paid" })]);
      const paidEvents = append.mock.calls.filter(
        ([e]) => e.type === "PayoutStatusChanged" && (e.data as { status: string }).status === "paid",
      );
      expect(paidEvents).toHaveLength(1);
      append.mockRestore();
    });

    it("409 PayoutRefused body, 400 on a malformed period, 401 without a member principal", async () => {
      const refused = await withdraw("2026-09");
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({ reason: "statement_not_found" });
      expect((await withdraw("2026-13")).status).toBe(400);
      expect((await withdraw(undefined)).status).toBe(400);
      const anonymous = await fetch(`${base}/v1/me/payouts`);
      expect(anonymous.status).toBe(401);
    });
  });
});
