import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { PaymentsService } from "./payments/payments.service.js";
import { InMemoryInvoiceLookup } from "./ports/invoice-lookup.port.js";
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
    const first = await ensure({ participantId: CONSUMER, stripeAccountId: "acct_test_p1" });
    expect(first.status).toBe(200);
    const created = (await first.json()) as { stripeCustomerId: string };
    expect(created).toMatchObject({
      participantId: CONSUMER,
      stripeAccountId: "acct_test_p1",
      stripeCustomerId: expect.stringMatching(/^cus_test_/),
    });
    const again = await ensure({ participantId: CONSUMER, stripeAccountId: "acct_test_p1" });
    expect(((await again.json()) as { stripeCustomerId: string }).stripeCustomerId).toBe(
      created.stripeCustomerId,
    );
    expect((await ensure({ participantId: CONSUMER, stripeAccountId: "bad" })).status).toBe(400);
    expect(
      (await ensure({ participantId: CONSUMER, stripeAccountId: "acct_test_p1" }, "member")).status,
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
    expect(created.stripeAccountId).toMatch(/^acct_test_/);

    const got = await fetch(
      `${base}/internal/v1/payment-accounts/${PRODUCER}`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({
      participantId: PRODUCER,
      stripeAccountId: created.stripeAccountId,
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
      stripeInvoiceId: "in_test_http",
      producerId: PRODUCER,
      consumerId: CONSUMER,
      currency: "EUR",
      status: "Open",
      total: "2.00",
      producerStripeAccountId: "acct_test_producer",
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

  it("webhook accepts signed provider events", async () => {
    const body = JSON.stringify({ id: "evt_http_ping", type: "ping", data: {} });
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
      stripeAccountId: expect.stringMatching(/^acct_test_/),
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
      stripeAccountId: expect.stringMatching(/^acct_test_/),
    });
  });
});
