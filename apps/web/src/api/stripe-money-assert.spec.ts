import { describe, expect, it, vi } from "vitest";
import {
  listStripeCharges,
  requireStripeSecretKey,
  waitForSucceededChargeForInvoice,
} from "./stripe-money-assert";

describe("stripe-money-assert (INT-251)", () => {
  it("requireStripeSecretKey accepts sk_test_ only", () => {
    expect(requireStripeSecretKey({ STRIPE_SECRET_KEY: "sk_test_abc" })).toBe(
      "sk_test_abc",
    );
    expect(() => requireStripeSecretKey({})).toThrow(/STRIPE_SECRET_KEY/);
    expect(() =>
      requireStripeSecretKey({ STRIPE_SECRET_KEY: "sk_live_x" }),
    ).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("listStripeCharges filters by invoice metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "ch_1",
            status: "succeeded",
            paid: true,
            amount: 200,
            currency: "eur",
            created: 100,
            metadata: { invoiceId: "inv-a" },
          },
          {
            id: "ch_2",
            status: "succeeded",
            paid: true,
            amount: 200,
            currency: "eur",
            created: 101,
            metadata: { invoiceId: "inv-b" },
          },
        ],
      }),
    });
    const rows = await listStripeCharges("sk_test_x", {
      invoiceId: "inv-b",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("ch_2");
  });

  it("waitForSucceededChargeForInvoice resolves when charge appears", async () => {
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          data:
            calls < 2
              ? []
              : [
                  {
                    id: "ch_ok",
                    status: "succeeded",
                    paid: true,
                    amount: 200,
                    currency: "eur",
                    created: 200,
                    metadata: { invoiceId: "inv-z" },
                    payment_intent: "pi_ok",
                  },
                ],
        }),
      };
    });
    const hit = await waitForSucceededChargeForInvoice("sk_test_x", "inv-z", {
      createdAfter: 150,
      timeoutMs: 5_000,
      pollMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(hit.id).toBe("ch_ok");
    expect(hit.payment_intent).toBe("pi_ok");
  });
});
