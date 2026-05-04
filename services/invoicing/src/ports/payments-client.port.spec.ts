import { describe, expect, it, vi } from "vitest";
import {
  createPaymentsClient,
  HttpPaymentsClient,
  isLiveStripeInvoiceProvider,
  NoopPaymentsClient,
} from "./payments-client.port.js";

describe("payments-client.port (INT-228)", () => {
  it("returns noop without PAYMENTS_INTERNAL_URL", () => {
    expect(createPaymentsClient({})).toBeInstanceOf(NoopPaymentsClient);
  });

  it("detects live Stripe invoice provider", () => {
    expect(isLiveStripeInvoiceProvider({ STRIPE_INVOICE_PROVIDER: "stripe" })).toBe(
      true,
    );
    expect(isLiveStripeInvoiceProvider({})).toBe(false);
  });

  it("HttpPaymentsClient returns Connect id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ stripeAccountId: "acct_live_1" }), {
        status: 200,
      }),
    );
    const client = new HttpPaymentsClient("http://payments:8080", fetchImpl as never);
    await expect(
      client.getProducerStripeAccountId("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toBe("acct_live_1");
  });

  it("HttpPaymentsClient returns null on 404", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    const client = new HttpPaymentsClient("http://payments:8080", fetchImpl as never);
    await expect(
      client.getProducerStripeAccountId("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toBeNull();
  });
});
