import { describe, expect, it } from "vitest";
import { MockPspEraseAdapter } from "./mock-psp-erase.adapter.js";

describe("MockPspEraseAdapter (INT-275)", () => {
  it("records erase commands (REQ-013)", async () => {
    const adapter = new MockPspEraseAdapter();
    const result = await adapter.erase({
      requestId: "req-1",
      participantId: "part-1",
      stripeCustomerId: "acct_test_1",
    });
    expect(result.ok).toBe(true);
    expect(adapter.recorded()).toHaveLength(1);
    expect(adapter.recorded()[0]?.participantId).toBe("part-1");
  });
});
