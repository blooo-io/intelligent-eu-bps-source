import { describe, expect, it } from "vitest";
import {
  InMemoryProcessedCommandsStore,
  PROCESSED_COMMAND_RETENTION_MS,
} from "./processed-commands.store.js";

const REQUEST_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("InMemoryProcessedCommandsStore (REQ-053)", () => {
  it("get/put round-trip and size()", async () => {
    const store = new InMemoryProcessedCommandsStore();
    expect(await store.get(REQUEST_ID)).toBeNull();
    await store.put(REQUEST_ID, {
      requestId: REQUEST_ID,
      operation: "startPayment",
      success: true,
      data: { paymentId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", status: "succeeded" },
    });
    expect(store.size()).toBe(1);
    expect(await store.get(REQUEST_ID)).toMatchObject({ success: true });
  });

  it("purge refuses retention above 7 days", async () => {
    const store = new InMemoryProcessedCommandsStore();
    await expect(
      store.purge(new Date(), PROCESSED_COMMAND_RETENTION_MS + 1),
    ).rejects.toThrow(/7 days/);
  });
});
