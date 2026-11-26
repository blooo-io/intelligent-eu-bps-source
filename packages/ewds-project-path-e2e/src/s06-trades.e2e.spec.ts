/**
 * INT-453 — S6 settled trade intake via EWDS market adapter (GSY request/reply).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RequestReplyClient } from "@intelligent/ewds-client";
import {
  EwdsMarketAdapter,
} from "@trade-intake/market/ewds-market.adapter.js";
import { markCovered } from "../fixtures/coverage-tracker.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../services/trade-intake/test/fixtures/gsy",
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

describe("INT-453 E2E S6 settled trade intake", () => {
  it("S6: EWDS tradesQuery returns settled EnergyTrade rows only", async () => {
    const fake = new FakeRr({
      tradesQuery: loadJson("tradesQuery.response.json"),
    });
    const adapter = new EwdsMarketAdapter(
      fake as unknown as RequestReplyClient,
    );
    const window = {
      from: "2026-11-01T00:00:00Z",
      until: "2026-11-01T06:00:00Z",
    };
    const trades = await adapter.queryTrades(window);
    expect(trades.length).toBeGreaterThan(0);
    expect(fake.calls.every((c) => c.op === "tradesQuery")).toBe(true);
    for (const t of trades) {
      expect(t.energyKWh).toBeGreaterThan(0);
      expect(t.pricePerKWhEur).toBeGreaterThan(0);
      expect(t.buyerActorId).toBeTruthy();
      expect(t.sellerActorId).toBeTruthy();
    }
    markCovered("S6", {
      run_path: "mock",
      input: { operation: "tradesQuery", window, rrCalls: fake.calls },
      output: { trades },
      notes: "FakeRr fixture — not live GSY/EWAG topics.",
    });
  });
});
