import { describe, expect, it, vi } from "vitest";
import {
  createBilledTradesStore,
  InMemoryBilledTradesStore,
  PostgresBilledTradesStore,
} from "./billed-trades.store.js";

describe("InMemoryBilledTradesStore (INT-225)", () => {
  it("persists marked trade ids across load", async () => {
    const store = new InMemoryBilledTradesStore();
    await store.mark(["t1", "t2"]);
    const loaded = await store.load();
    expect(loaded.has("t1")).toBe(true);
    expect(loaded.has("t2")).toBe(true);
    expect(loaded.has("t3")).toBe(false);
  });
});

describe("PostgresBilledTradesStore (INT-225)", () => {
  it("ensures schema, loads and marks via pool", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [{ trade_id: "t0" }] }) // SELECT
      .mockResolvedValue({ rows: [] });
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined), // COMMIT
      release: vi.fn(),
    };
    const pool = {
      query,
      connect: vi.fn(async () => client),
    };
    const store = new PostgresBilledTradesStore(pool as never);
    const loaded = await store.load();
    expect(loaded.has("t0")).toBe(true);
    await store.mark(["t1"]);
    expect(client.query).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
    await store.mark([]); // no-op
  });

  it("rolls back on mark failure", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error("disk full")),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(async () => ({ rows: [] })), // ensureSchema
      connect: vi.fn(async () => client),
    };
    const store = new PostgresBilledTradesStore(pool as never);
    await expect(store.mark(["t1"])).rejects.toThrow("disk full");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});

describe("createBilledTradesStore (INT-225)", () => {
  it("uses in-memory without DATABASE_URL", () => {
    expect(createBilledTradesStore({})).toBeInstanceOf(InMemoryBilledTradesStore);
  });
});

