import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EwdsRemoteError, type RequestReplyClient } from "@intelligent/ewds-client";
import { EwdsMarketAdapter, splitWindowEpoch } from "./ewds-market.adapter.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/gsy",
);

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(fixtures, name), "utf8")) as T;
}

class FakeRr implements Pick<RequestReplyClient, "request"> {
  readonly calls: Array<{ op: string; payload: unknown }> = [];
  constructor(private readonly byOp: Record<string, unknown[]>) {}
  async request<P, D>(operation: string, payload: P): Promise<D[]> {
    this.calls.push({ op: operation, payload });
    return (this.byOp[operation] ?? []) as D[];
  }
}

describe("EwdsMarketAdapter (Task 4.9 / INT-440)", () => {
  it("REQ-001 UAT-001: splits a 30 h window into tradesQuery calls of at most 86400 s", async () => {
    const fake = new FakeRr({ tradesQuery: [] });
    const a = new EwdsMarketAdapter(fake as unknown as RequestReplyClient);
    await a.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-02T06:00:00Z",
    });
    expect(fake.calls.map((c) => [c.op, (c.payload as { end: number; start: number }).end - (c.payload as { start: number }).start])).toEqual([
      ["tradesQuery", 86400],
      ["tradesQuery", 21600],
    ]);
    expect(splitWindowEpoch("2026-11-01T00:00:00Z", "2026-11-02T06:00:00Z")).toHaveLength(2);
  });

  it("maps bytes16 ids, RFC3339 or epoch times, settled-only (case-insensitive 'Settled')", async () => {
    const fake = new FakeRr({
      tradesQuery: loadJson("tradesQuery.response.json"),
    });
    const a = new EwdsMarketAdapter(fake as unknown as RequestReplyClient);
    const t = await a.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-01T06:00:00Z",
    });
    expect(t[0]).toMatchObject({
      tradeId: "0x0123456789abcdef0123456789abcdef",
      status: "settled",
      pricePerKWhEur: 0.12,
      energyKWh: 3.5,
    });
    expect(t.find((x) => x.tradeId.startsWith("0xopen"))).toBeUndefined();
  });

  it("A10.3: maps optional adjustedPrice when present", async () => {
    const fake = new FakeRr({
      tradesQuery: loadJson("tradesQuery.response.json"),
    });
    const a = new EwdsMarketAdapter(fake as unknown as RequestReplyClient);
    const t = await a.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-01T06:00:00Z",
    });
    expect(t[0]?.adjustedPricePerKWhEur).toBe(0.115);
  });

  it("queryClearingResults sends marketId and maps numTrades/tradedQuantityKWh", async () => {
    const fake = new FakeRr({
      clearingResultsQuery: loadJson("clearingResultsQuery.response.json"),
    });
    const a = new EwdsMarketAdapter(fake as unknown as RequestReplyClient);
    const c = await a.queryClearingResults("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(c).toEqual({
      marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      numTrades: 1,
      tradedQuantityKWh: 3.5,
    });
    expect(fake.calls[0]).toMatchObject({
      op: "clearingResultsQuery",
      payload: { marketId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    });
  });

  it("dedupes a trade returned twice across overlapping windows (UAT-001 duplicate)", async () => {
    const rows = loadJson<unknown[]>("tradesQuery.response.json");
    const fake = new FakeRr({ tradesQuery: rows });
    const a = new EwdsMarketAdapter(fake as unknown as RequestReplyClient);
    const t = await a.queryTrades({
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-01T06:00:00Z",
    });
    expect(t.filter((x) => x.tradeId === "0x0123456789abcdef0123456789abcdef")).toHaveLength(1);
  });

  it("rejects a response whose trade lacks market_id/energy/price with EwdsRemoteError('schema')", async () => {
    const fake = new FakeRr({
      tradesQuery: [{ trade_id: "x", status: "settled" }],
    });
    const a = new EwdsMarketAdapter(fake as unknown as RequestReplyClient);
    await expect(
      a.queryTrades({
        from: "2026-11-01T00:00:00Z",
        until: "2026-11-01T01:00:00Z",
      }),
    ).rejects.toBeInstanceOf(EwdsRemoteError);
  });
});
