import { describe, expect, it, vi } from "vitest";
import {
  HttpCommandTargetsClient,
  CommandTargetError,
  parseReturnUrlPrefixes,
} from "./command-targets.client.js";

const PAYMENT_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const INV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const C1 = "a1000000-0000-4000-8000-000000000001";

describe("HttpCommandTargetsClient (REQ-052 / Task 4.3)", () => {
  it("startPayment posts to /internal/v1/payments:start with service auth", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          paymentId: PAYMENT_ID,
          status: "requires_action",
          handoff: {
            surface: "hosted",
            provider: "stripe",
            purpose: "checkout",
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
            expiresAt: "2026-11-24T10:30:00Z",
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = new HttpCommandTargetsClient(
      {
        paymentsBaseUrl: "http://payments:8080",
        invoicingBaseUrl: "http://invoicing:8080",
        notificationBaseUrl: "http://notification:8080",
        settlementBaseUrl: "http://settlement:8080",
        participantsBaseUrl: "http://participants:8080",
      },
      fetchImpl,
    );

    const r = await client.startPayment({
      invoiceId: INV,
      actorId: ACTOR,
      surface: "hosted",
      returnUrl: "https://ui.intelligent-project.eu/return",
    });
    expect(r.paymentId).toBe(PAYMENT_ID);
    expect(calls[0]?.url).toBe("http://payments:8080/internal/v1/payments:start");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("maps 404 -> not_found, 409 -> conflict, 5xx -> unavailable", async () => {
    for (const [status, code] of [
      [404, "not_found"],
      [409, "conflict"],
      [503, "unavailable"],
    ] as const) {
      const fetchImpl = vi.fn(
        async () => new Response("", { status }),
      ) as unknown as typeof fetch;
      const client = new HttpCommandTargetsClient(
        {
          paymentsBaseUrl: "http://payments:8080",
          invoicingBaseUrl: "http://invoicing:8080",
          notificationBaseUrl: "http://notification:8080",
          settlementBaseUrl: "http://settlement:8080",
        },
        fetchImpl,
      );
      await expect(
        client.setInvoiceStatus({
          invoiceId: INV,
          status: "Void",
          reason: "dup",
          actorId: ACTOR,
          communityId: C1,
        }),
      ).rejects.toMatchObject({
        name: "CommandTargetError",
        code,
        status,
      } satisfies Partial<CommandTargetError>);
    }
  });

  it("startRun accepts 202", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ runId: C1 }), { status: 202 }),
    ) as unknown as typeof fetch;
    const client = new HttpCommandTargetsClient(
      {
        paymentsBaseUrl: "http://payments:8080",
        invoicingBaseUrl: "http://invoicing:8080",
        notificationBaseUrl: "http://notification:8080",
        settlementBaseUrl: "http://settlement:8080",
        participantsBaseUrl: "http://participants:8080",
      },
      fetchImpl,
    );
    const r = await client.startRun({
      communityId: C1,
      type: "periodic",
      period: "2026-11",
    });
    expect(r.runId).toBe(C1);
  });

  it("parseReturnUrlPrefixes splits comma-separated prefixes", () => {
    expect(parseReturnUrlPrefixes(undefined)).toEqual([]);
    expect(
      parseReturnUrlPrefixes(
        "https://ui.intelligent-project.eu/, https://app.example/",
      ),
    ).toEqual([
      "https://ui.intelligent-project.eu/",
      "https://app.example/",
    ]);
  });

  it("requestWithdrawal, startKyc, sendReminder and setupPaymentMethod hit their paths", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("payouts:request")) {
        return new Response(
          JSON.stringify({
            payoutId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            payoutStatus: "pending",
            amount: 1,
            currency: "EUR",
          }),
          { status: 200 },
        );
      }
      if (u.includes("kyc:start")) {
        return new Response(
          JSON.stringify({
            surface: "hosted",
            provider: "stripe",
            purpose: "identity",
            url: "https://verify.stripe.com/v/test",
            expiresAt: "2026-11-24T10:30:00Z",
          }),
          { status: 200 },
        );
      }
      // INT-461 — sendReminder targets AC-06 invoice reminders (not AC-11).
      if (u.includes("/invoices/") && u.includes("/reminders")) {
        expect(u).toContain("invoicing:8080");
        return new Response(
          JSON.stringify({ invoiceId: INV, reminderCount: 1 }),
          { status: 200 },
        );
      }
      if (u.includes("payment-methods:setup")) {
        return new Response(
          JSON.stringify({
            handoff: {
              surface: "hosted",
              provider: "stripe",
              purpose: "setup",
              url: "https://checkout.stripe.com/c/pay/setup",
              expiresAt: "2026-11-24T10:30:00Z",
            },
          }),
          { status: 200 },
        );
      }
      if (u.includes("terms-acceptance")) {
        return new Response(
          JSON.stringify({
            termsVersion: "v1.0.0",
            selfBillingMandate: true,
            acceptedAt: "2026-11-26T06:00:00.000Z",
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;

    const client = new HttpCommandTargetsClient(
      {
        paymentsBaseUrl: "http://payments:8080",
        invoicingBaseUrl: "http://invoicing:8080",
        notificationBaseUrl: "http://notification:8080",
        settlementBaseUrl: "http://settlement:8080",
        participantsBaseUrl: "http://participants:8080",
      },
      fetchImpl,
    );

    await expect(
      client.requestWithdrawal({ actorId: ACTOR, currency: "EUR" }),
    ).resolves.toMatchObject({ currency: "EUR" });
    await expect(
      client.startKyc({
        actorId: ACTOR,
        kind: "identity",
        surface: "hosted",
      }),
    ).resolves.toMatchObject({ purpose: "identity" });
    await expect(
      client.sendReminder({
        invoiceId: INV,
        actorId: ACTOR,
        communityId: C1,
      }),
    ).resolves.toMatchObject({ invoiceId: INV, reminderCount: 1 });
    await expect(
      client.setupPaymentMethod({ actorId: ACTOR, surface: "hosted" }),
    ).resolves.toMatchObject({ handoff: { purpose: "setup" } });
    await expect(
      client.acceptTerms({
        actorId: ACTOR,
        termsVersion: "v1.0.0",
        selfBillingMandate: true,
      }),
    ).resolves.toMatchObject({ termsVersion: "v1.0.0" });
  });

  it("maps 400 -> invalid", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 400 }),
    ) as unknown as typeof fetch;
    const client = new HttpCommandTargetsClient(
      {
        paymentsBaseUrl: "http://payments:8080",
        invoicingBaseUrl: "http://invoicing:8080",
        notificationBaseUrl: "http://notification:8080",
        settlementBaseUrl: "http://settlement:8080",
        participantsBaseUrl: "http://participants:8080",
      },
      fetchImpl,
    );
    await expect(
      client.sendReminder({
        invoiceId: INV,
        actorId: ACTOR,
        communityId: C1,
      }),
    ).rejects.toMatchObject({ code: "invalid", status: 400 });
  });

  it("network failure maps to unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new HttpCommandTargetsClient(
      {
        paymentsBaseUrl: "http://payments:8080",
        invoicingBaseUrl: "http://invoicing:8080",
        notificationBaseUrl: "http://notification:8080",
        settlementBaseUrl: "http://settlement:8080",
        participantsBaseUrl: "http://participants:8080",
      },
      fetchImpl,
    );
    await expect(
      client.startPayment({
        invoiceId: INV,
        actorId: ACTOR,
        surface: "hosted",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
