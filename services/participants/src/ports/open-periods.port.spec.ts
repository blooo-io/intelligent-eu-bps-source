/**
 * REQ-043 / INT-440 — open-periods port selection and HTTP probe.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmptyOpenPeriods,
  HttpOpenPeriods,
  createOpenPeriods,
} from "./open-periods.port.js";

describe("OpenPeriodsPort (REQ-043)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to EmptyOpenPeriods when SETTLEMENT_INTERNAL_URL is unset", async () => {
    const port = createOpenPeriods({});
    expect(port).toBeInstanceOf(EmptyOpenPeriods);
    await expect(port.list("c1")).resolves.toEqual({
      communityId: "c1",
      periods: [],
    });
  });

  it("selects HttpOpenPeriods when SETTLEMENT_INTERNAL_URL is set", () => {
    const port = createOpenPeriods({
      SETTLEMENT_INTERNAL_URL: "http://settlement:8080",
    });
    expect(port).toBeInstanceOf(HttpOpenPeriods);
  });

  it("HttpOpenPeriods maps a successful JSON body", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        communityId: "c1",
        periods: ["2026-11", "2026-Q4"],
      }),
    })) as unknown as typeof fetch;
    const port = new HttpOpenPeriods("http://settlement:8080/", fetchImpl);
    await expect(port.list("c1")).resolves.toEqual({
      communityId: "c1",
      periods: ["2026-11", "2026-Q4"],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://settlement:8080/internal/v1/communities/c1/open-periods",
      { headers: { "x-intelligent-roles": "service" } },
    );
  });

  it("HttpOpenPeriods falls back when periods is not an array", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ communityId: "c1", periods: "nope" }),
    })) as unknown as typeof fetch;
    const port = new HttpOpenPeriods("http://settlement:8080", fetchImpl);
    await expect(port.list("c1")).resolves.toEqual({
      communityId: "c1",
      periods: [],
    });
  });

  it("HttpOpenPeriods throws on non-OK response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const port = new HttpOpenPeriods("http://settlement:8080", fetchImpl);
    await expect(port.list("c1")).rejects.toThrow(/open-periods 503/);
  });
});
