import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { NotificationService } from "./notification/notification.service.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";

describe("notification HTTP (INT-110)", () => {
  let app: INestApplication;
  let base: string;
  let service: NotificationService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(NotificationService);
  });

  beforeEach(() => {
    service.resetStore();
    service.registerRecipient(PARTICIPANT, "member@example.com");
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "notification" });
  });

  it("wired Nest module delivers a notice through Mailpit catcher (UAT-017)", async () => {
    await service.onPaymentStatusChanged({
      eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      paymentId: "pay-http",
      invoiceId: "inv-http",
      status: "succeeded",
      participantId: PARTICIPANT,
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
    expect(service.capturedMail()).toHaveLength(1);
    expect(service.listLogs()[0]).toMatchObject({
      paymentId: "pay-http",
      template: "payment-success",
    });
  });
});
