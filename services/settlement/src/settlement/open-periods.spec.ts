/**
 * REQ-043 / INT-440 — open-periods lists unbilled calendar periods.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { SettlementStore } from "../domain/store.js";
import { FixtureTradeSource } from "../ports/fixture-trade-source.js";
import { SettlementService } from "./settlement.service.js";

describe("listOpenPeriods (REQ-043)", () => {
  let service: SettlementService;
  let trades: FixtureTradeSource;

  beforeEach(() => {
    trades = new FixtureTradeSource("S1");
    service = new SettlementService(
      new SettlementStore(),
      new OutboxService(new InMemoryOutboxStore()),
      trades,
    );
    service.useClock(() => new Date("2026-11-15T12:00:00Z"));
  });

  it("REQ-043 open-periods lists periods with unbilled or open invoices", async () => {
    const communityId = trades.communityId();
    const result = await service.listOpenPeriods(communityId);
    expect(result.communityId).toBe(communityId);
    // S1 fixture trades land in 2026-11 and are still unbilled.
    expect(result.periods).toContain("2026-11");
  });

  it("returns an empty list after trades are billed and carry is cleared", async () => {
    const communityId = trades.communityId();
    const unbilled = await trades.getUnbilled(
      communityId,
      "2026-12-01T00:00:00Z",
    );
    await trades.markBilled(unbilled.map((t) => t.tradeId));
    const result = await service.listOpenPeriods(communityId);
    expect(result.periods).toEqual([]);
  });
});
