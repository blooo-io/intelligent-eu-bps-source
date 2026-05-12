import { describe, expect, it, vi } from "vitest";
import {
  createPaymentsClient,
  HttpPaymentsClient,
  isLiveStripeInvoiceProvider,
  NoopPaymentsClient,
} from "./payments-client.port.js";

describe("payments-client.port (INT-228 / INT-231)", () => {
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
