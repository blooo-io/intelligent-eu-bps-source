import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "@intelligent/module-template";
import { SettlementStore } from "../domain/store.js";
import { applySettlementWrites, hydrateSettlement } from "./settlement-journal.js";
import type { PairSettlementRecord } from "../domain/types.js";

const settlement = (id: string): PairSettlementRecord => ({
  settlementId: id,
  runId: "run-1",
  consumerId: "c",
  producerId: "p",
  tradeIds: ["t1"],
  lines: [],
  kWh: "1.000",
  energyAmount: "1.00",
  vat: "0.00",
  currency: "EUR",
  rate: "1.0000",
  rateDate: "2026-11-09",
  carriedForwardIn: "0.00",
  carriedForwardOut: "0.00",
  netAmount: 1,
  version: 1,
});

/** INT-356 / BR-13 — settlement rows survive a restart. */
describe("settlement journal (INT-356)", () => {
  it("applies an append-only settlement and reloads it", async () => {
    const tables = {
      settlements: [] as Record<string, unknown>[],
      runs: [] as Record<string, unknown>[],
      carry: [] as Record<string, unknown>[],
    };
    const sql: SqlExecutor = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        if (text.includes("INSERT INTO settlement_settlements")) {
          tables.settlements.push({ payload: JSON.parse(String(params[1])) });
        }
        if (text.includes("INSERT INTO settlement_carry")) {
          tables.carry.push({
            pair_key: params[0],
            community_id: params[1],
            amount: params[2],
          });
        }
        if (text.startsWith("SELECT payload FROM settlement_settlements")) {
          return { rows: tables.settlements };
        }
        if (text.startsWith("SELECT payload FROM settlement_runs")) {
          return { rows: tables.runs };
        }
        if (text.startsWith("SELECT pair_key")) return { rows: tables.carry };
        return { rows: [] };
      }),
    };
    await applySettlementWrites(sql, [
      { kind: "settlement", row: settlement("set-1") },
      { kind: "carry", key: "a|b", communityId: "com", amount: "5000000000000" },
    ]);
    const restored = new SettlementStore();
    await hydrateSettlement(sql, restored);
    expect(restored.getSettlement("set-1")?.energyAmount).toBe("1.00");
    expect(restored.getCarry("a", "b").toString()).toBe("5000000000000");
  });

  it("createSettlementTransaction stays in memory without DATABASE_URL", async () => {
    const { createSettlementTransaction } = await import("./settlement-journal.js");
    const { transaction } = createSettlementTransaction(
      new SettlementStore(),
      { append: vi.fn(), stage: vi.fn() } as never,
      {},
    );
    await expect(transaction.run(async () => "mem")).resolves.toBe("mem");
  });
});
