import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { PaymentsService } from "./payments/payments.service.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const CONSUMER = "11111111-2222-4333-8444-555555555555";

describe("payments HTTP (INT-107)", () => {
  let app: INestApplication;
  let base: string;
  let service: PaymentsService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(PaymentsService);
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
      url: expect.stringContaining("stripe.com"),
    });

    service.ensureParticipant({
      participantId: CONSUMER,
      communityId: COMMUNITY,
      role: "consumer",
    });
    await service.attachPaymentMethod(CONSUMER, "pm_card_visa");

    const pay = await fetch(
      `${base}/v1/invoices/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/payments`,
      {
        method: "POST",
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": CONSUMER,
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(pay.status).toBe(201);
    expect(await pay.json()).toMatchObject({ status: "succeeded" });
  });

  it("webhook accepts signed provider events", async () => {
    const body = JSON.stringify({ type: "ping", data: {} });
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

  it("producer and prosumer onboarding paths", async () => {
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
    expect(await res.json()).toMatchObject({
      url: expect.stringContaining("connect.stripe.com"),
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
      url: expect.stringContaining("connect.stripe.com"),
    });
  });
});
