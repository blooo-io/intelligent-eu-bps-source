import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StripePspEraseAdapter,
  type StripeEraseClient,
} from "./stripe-psp-erase.adapter.js";

function stubStripe(): StripeEraseClient & {
  customersDel: ReturnType<typeof vi.fn>;
  accountsDel: ReturnType<typeof vi.fn>;
} {
  const customersDel = vi.fn(async () => ({ deleted: true }));
  const accountsDel = vi.fn(async () => ({ deleted: true }));
  return {
    customersDel,
    accountsDel,
    customers: { del: customersDel },
    accounts: { del: accountsDel },
  };
}

describe("StripePspEraseAdapter (INT-275 / INT-429)", () => {
  const saved = process.env.PSP_PROVIDER;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.PSP_PROVIDER;
    } else {
      process.env.PSP_PROVIDER = saved;
    }
  });

  it("REQ-013 / UAT-013: test-mode erase deletes customers and the connected account", async () => {
    process.env.PSP_PROVIDER = "stripe";
    const stripe = stubStripe();
    const adapter = new StripePspEraseAdapter(stripe);
    const result = await adapter.erase({
      requestId: "req-2",
      participantId: "part-2",
      pspAccountRef: "acct_1",
      platformCustomerIds: ["cus_platform"],
      connectedCustomers: [
        { accountRef: "acct_1", customerRef: "cus_connected" },
      ],
      livemode: false,
    });
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("erased");
    expect(stripe.customersDel).toHaveBeenCalledTimes(2);
    expect(stripe.customersDel).toHaveBeenNthCalledWith(1, "cus_platform");
    expect(stripe.customersDel).toHaveBeenNthCalledWith(
      2,
      "cus_connected",
      undefined,
      { stripeAccount: "acct_1" },
    );
    expect(stripe.accountsDel).toHaveBeenCalledWith("acct_1");
    expect(adapter.recorded()).toHaveLength(1);
  });

  it("REQ-013: live-mode erase keeps the account and returns retained_by_psp", async () => {
    process.env.PSP_PROVIDER = "stripe";
    const stripe = stubStripe();
    const adapter = new StripePspEraseAdapter(stripe);
    const result = await adapter.erase({
      requestId: "req-live",
      participantId: "part-live",
      pspAccountRef: "acct_live",
      platformCustomerIds: ["cus_a"],
      connectedCustomers: [],
      livemode: true,
    });
    expect(result.outcome).toBe("retained_by_psp");
    expect(result.reason).toBe("aml_legal_obligation");
    expect(stripe.customersDel).toHaveBeenCalledTimes(1);
    expect(stripe.accountsDel).not.toHaveBeenCalled();
  });

  it("rejects erase when not in stripe mode", async () => {
    delete process.env.PSP_PROVIDER;
    const adapter = new StripePspEraseAdapter(stubStripe());
    await expect(
      adapter.erase({
        requestId: "req-3",
        participantId: "part-3",
        platformCustomerIds: [],
        connectedCustomers: [],
        livemode: false,
      }),
    ).rejects.toThrow(/stripe/i);
  });

  it("REQ-013: empty customers after INT-428 still deletes the test account", async () => {
    process.env.PSP_PROVIDER = "stripe";
    const stripe = stubStripe();
    const adapter = new StripePspEraseAdapter(stripe);
    const result = await adapter.erase({
      requestId: "req-empty-cus",
      participantId: "part-empty-cus",
      pspAccountRef: "acct_only",
      platformCustomerIds: [],
      connectedCustomers: [],
      livemode: false,
    });
    expect(result.outcome).toBe("erased");
    expect(stripe.customersDel).not.toHaveBeenCalled();
    expect(stripe.accountsDel).toHaveBeenCalledWith("acct_only");
  });
});
