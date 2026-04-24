import { describe, expect, it, vi } from "vitest";
import { connectWithRetry } from "./connect-retry.js";

describe("connectWithRetry (INT-227)", () => {
  it("returns on first successful connect", async () => {
    const conn = { ok: true } as never;
    const connect = vi.fn(async () => conn);
    const sleep = vi.fn(async () => undefined);
    const result = await connectWithRetry("temporal:7233", {
      connect,
      sleep,
      attempts: 3,
    });
    expect(result).toBe(conn);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries then succeeds", async () => {
    const conn = { ok: true } as never;
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(conn);
    const sleep = vi.fn(async () => undefined);
    const result = await connectWithRetry("temporal:7233", {
      connect,
      sleep,
      attempts: 5,
      baseDelayMs: 10,
    });
    expect(result).toBe(conn);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("throws after exhausting attempts", async () => {
    const connect = vi.fn(async () => {
      throw new Error("down");
    });
    const sleep = vi.fn(async () => undefined);
    await expect(
      connectWithRetry("temporal:7233", {
        connect,
        sleep,
        attempts: 3,
        baseDelayMs: 1,
      }),
    ).rejects.toThrow("down");
    expect(connect).toHaveBeenCalledTimes(3);
  });
});
