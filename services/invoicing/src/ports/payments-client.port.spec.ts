import { describe, expect, it, vi } from "vitest";
import {
  createPaymentsClient,
  HttpPaymentsClient,
  isLiveStripeInvoiceProvider,
  NoopPaymentsClient,
} from "./payments-client.port.js";

describe("payments-client.port (INT-228 / INT-231)", () => {
  it("INT-338 — reads the authoritative payment and treats 404 as absent", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ paymentId: "pay-1", invoiceId: "inv-1", status: "succeeded" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    const client = new HttpPaymentsClient("http://payments:8080/", fetchImpl as never);
    await expect(client.getPayment("pay-1")).resolves.toEqual({
      paymentId: "pay-1",
      invoiceId: "inv-1",
      status: "succeeded",
    });
    await expect(client.getPayment("missing")).resolves.toBeNull();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://payments:8080/internal/v1/payments/pay-1",
    );
  });

  it("returns noop without PAYMENTS_INTERNAL_URL", () => {
    expect(createPaymentsClient({})).toBeInstanceOf(NoopPaymentsClient);
  });

  it("detects live Stripe invoice provider", () => {
    expect(isLiveStripeInvoiceProvider({ STRIPE_INVOICE_PROVIDER: "stripe" })).toBe(
      true,
    );
    expect(isLiveStripeInvoiceProvider({})).toBe(false);
  });

  it("HttpPaymentsClient returns Connect id and chargesEnabled", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          stripeAccountId: "acct_live_1",
          chargesEnabled: true,
        }),
        { status: 200 },
      ),
    );
    const client = new HttpPaymentsClient("http://payments:8080", fetchImpl as never);
    await expect(
      client.getProducerStripeAccountId("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toBe("acct_live_1");
    await expect(
      client.getPaymentAccount("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toEqual({
      stripeAccountId: "acct_live_1",
      chargesEnabled: true,
    });
  });

  it("HttpPaymentsClient returns null on 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    const client = new HttpPaymentsClient("http://payments:8080", fetchImpl as never);
    await expect(
      client.getProducerStripeAccountId("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toBeNull();
    await expect(
      client.getPaymentAccount("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toBeNull();
  });

  it("UAT-014 REQ-014 HttpPaymentsClient ensures the connected-account Customer (INT-355)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: "c1",
          stripeAccountId: "acct_1",
          stripeCustomerId: "cus_conn",
        }),
        { status: 200 },
      ),
    );
    const client = new HttpPaymentsClient("http://payments:8080/", fetchImpl as never);
    await expect(client.ensureConnectedCustomer("c1", "acct_1")).resolves.toBe("cus_conn");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://payments:8080/internal/v1/connected-customers:ensure");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      participantId: "c1",
      stripeAccountId: "acct_1",
    });
  });

  it("HttpPaymentsClient ensureConnectedCustomer handles empty and error responses", async () => {
    const empty = new HttpPaymentsClient(
      "http://payments:8080",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as never,
    );
    await expect(empty.ensureConnectedCustomer("c1", "acct_1")).resolves.toBeNull();
    const failing = new HttpPaymentsClient(
      "http://payments:8080",
      vi.fn(async () => new Response("", { status: 503 })) as never,
    );
    await expect(failing.ensureConnectedCustomer("c1", "acct_1")).rejects.toThrow(/503/);
    await expect(
      new NoopPaymentsClient().ensureConnectedCustomer("c1", "acct_1"),
    ).resolves.toBeNull();
  });

  it("HttpPaymentsClient surfaces chargesEnabled=false", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          stripeAccountId: "acct_pending",
          chargesEnabled: false,
        }),
        { status: 200 },
      ),
    );
    const client = new HttpPaymentsClient("http://payments:8080", fetchImpl as never);
    await expect(client.getPaymentAccount("p1")).resolves.toEqual({
      stripeAccountId: "acct_pending",
      chargesEnabled: false,
    });
  });
});
