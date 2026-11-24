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
});
