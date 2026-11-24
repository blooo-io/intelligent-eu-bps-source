/**
 * REQ-043 / A10.1 — BillingModeResolver HTTP cache and fail-closed behaviour.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBillingModeResolver,
  HttpBillingModeResolver,
  StaticBillingModeResolver,
} from "./billing-mode.resolver.js";

describe("BillingModeResolver (REQ-043)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("REQ-043: resolves live from AC-03 settings and caches 30 s", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () =>
      Response.json({ billingMode: "live", autoPayout: false }),
    );
    const resolver = new HttpBillingModeResolver(
      "http://participants.invalid",
      fetchImpl as unknown as typeof fetch,
      null,
      () => Date.now(),
    );

    await expect(resolver.modeOf("c-1")).resolves.toBe("live");
    // Second call within 10 s must hit the cache.
    vi.advanceTimersByTime(10_000);
    await expect(resolver.modeOf("c-1")).resolves.toBe("live");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // After 31 s from the cached entry, a fresh fetch is required.
    vi.advanceTimersByTime(21_000);
    await expect(resolver.modeOf("c-1")).resolves.toBe("live");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("REQ-043: unknown value maps to virtual, HTTP error throws (fail closed)", async () => {
    const ok = vi.fn(async () =>
      Response.json({ billingMode: "weird", autoPayout: false }),
    );
    const okResolver = new HttpBillingModeResolver(
      "http://participants.invalid",
      ok as unknown as typeof fetch,
    );
    await expect(okResolver.modeOf("c-1")).resolves.toBe("virtual");

    const fail = vi.fn(async () => new Response("err", { status: 503 }));
    const failResolver = new HttpBillingModeResolver(
      "http://participants.invalid",
      fail as unknown as typeof fetch,
    );
    await expect(failResolver.modeOf("c-1")).rejects.toThrow(/failed with 503/);
  });

  it("static resolver returns virtual", async () => {
    const resolver = new StaticBillingModeResolver("virtual");
    await expect(resolver.modeOf("any")).resolves.toBe("virtual");
  });

  it("createBillingModeResolver uses static when URL unset", () => {
    const resolver = createBillingModeResolver({});
    expect(resolver).toBeInstanceOf(StaticBillingModeResolver);
  });

  it("createBillingModeResolver uses HTTP when PARTICIPANTS_INTERNAL_URL set", () => {
    const resolver = createBillingModeResolver({
      PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
    });
    expect(resolver).toBeInstanceOf(HttpBillingModeResolver);
  });
});
