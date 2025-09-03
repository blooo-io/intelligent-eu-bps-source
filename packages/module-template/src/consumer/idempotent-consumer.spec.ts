import { describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "./idempotent-consumer.js";

describe("IdempotentConsumer (NFR-006 / UAT-038)", () => {
  it("processes a new event once and skips duplicates on eventId", async () => {
    const store = new InMemoryProcessedEventsStore();
    const consumer = new IdempotentConsumer(store);
    const handler = vi.fn(async () => undefined);

    await expect(
      consumer.handle("evt-1", { ok: true }, handler),
    ).resolves.toEqual({ status: "processed" });
    await expect(
      consumer.handle("evt-1", { ok: true }, handler),
    ).resolves.toEqual({ status: "duplicate" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("surfaces a clear failure and does not mark the event so it can retry", async () => {
    const store = new InMemoryProcessedEventsStore();
    const consumer = new IdempotentConsumer(store);
    const failure = new Error("Stripe unavailable");

    const first = await consumer.handle("evt-2", {}, async () => {
      throw failure;
    });
    expect(first).toEqual({ status: "failed", error: failure });
    expect(await store.has("evt-2")).toBe(false);

    const second = await consumer.handle("evt-2", {}, async () => undefined);
    expect(second).toEqual({ status: "processed" });
  });

  it("wraps non-Error throws as Error for a clear failure state", async () => {
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    const result = await consumer.handle("evt-3", {}, async () => {
      throw "boom";
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("boom");
    }
  });
});
