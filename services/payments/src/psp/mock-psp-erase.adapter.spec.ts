import { describe, expect, it } from "vitest";
import { MockPspEraseAdapter } from "./mock-psp-erase.adapter.js";

describe("MockPspEraseAdapter (INT-275)", () => {
  it("records erase commands (REQ-013)", async () => {
    const adapter = new MockPspEraseAdapter();
    const result = await adapter.erase({
      requestId: "req-1",
      participantId: "part-1",
      pspAccountRef: "acct_test_1",
      platformCustomerIds: [],
      connectedCustomers: [],
      livemode: false,
    });
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe("erased");
    expect(adapter.recorded()).toHaveLength(1);
    expect(adapter.recorded()[0]?.participantId).toBe("part-1");
  });

  it("REQ-013: live-mode with account returns retained_by_psp", async () => {
    const adapter = new MockPspEraseAdapter();
    const result = await adapter.erase({
      requestId: "req-live",
      participantId: "part-live",
      pspAccountRef: "acct_live_1",
      platformCustomerIds: ["cus_1"],
      connectedCustomers: [],
      livemode: true,
    });
    expect(result.outcome).toBe("retained_by_psp");
    expect(result.reason).toBe("aml_legal_obligation");
  });

  it("REQ-013: nothing_to_erase when no customers or account", async () => {
    const adapter = new MockPspEraseAdapter();
    const result = await adapter.erase({
      requestId: "req-empty",
      participantId: "part-empty",
      platformCustomerIds: [],
      connectedCustomers: [],
      livemode: false,
    });
    expect(result.outcome).toBe("nothing_to_erase");
  });
});
