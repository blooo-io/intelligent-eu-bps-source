import { afterEach, describe, expect, it } from "vitest";
import { StripePspEraseAdapter } from "./stripe-psp-erase.adapter.js";

describe("StripePspEraseAdapter (INT-275)", () => {
  const saved = process.env.PSP_PROVIDER;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.PSP_PROVIDER;
    } else {
      process.env.PSP_PROVIDER = saved;
    }
  });

  it("records erase when PSP_PROVIDER=stripe (REQ-013)", async () => {
    process.env.PSP_PROVIDER = "stripe";
    const adapter = new StripePspEraseAdapter();
    const result = await adapter.erase({
      requestId: "req-2",
      participantId: "part-2",
      stripeCustomerId: "acct_test_2",
    });
    expect(result.ok).toBe(true);
    expect(adapter.recorded()).toHaveLength(1);
  });

  it("rejects erase when not in stripe mode", async () => {
    delete process.env.PSP_PROVIDER;
    const adapter = new StripePspEraseAdapter();
    await expect(
      adapter.erase({
        requestId: "req-3",
        participantId: "part-3",
      }),
    ).rejects.toThrow(/stripe/i);
  });
});
