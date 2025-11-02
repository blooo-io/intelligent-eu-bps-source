/** P-MKT mock — returns fixture trades/markets/clearing for the active scenario. */
import type {
  ClearingResult,
  MarketInfo,
  MarketPort,
  ScenarioDataset,
  TimeWindow,
  TradeFixture,
} from "../types.js";

function overlaps(window: TimeWindow, start: string, end: string): boolean {
  return start < window.until && end > window.from;
}

export function createMockMarket(scenario: ScenarioDataset): MarketPort {
  return {
    queryTrades(window: TimeWindow): TradeFixture[] {
      return scenario.trades.filter(
        (t) =>
          t.status === "settled" &&
          overlaps(window, t.deliveryStart, t.deliveryEnd),
      );
    },
    queryMarkets(window: TimeWindow): MarketInfo[] {
      return scenario.markets.filter((m) =>
        overlaps(window, m.deliveryStart, m.deliveryEnd),
      );
    },
    queryClearingResults(marketId: string): ClearingResult {
      const found = scenario.clearingResults.find((c) => c.marketId === marketId);
      if (!found) {
        throw new Error(`No clearing result for market ${marketId}`);
      }
      return { ...found };
    },
  };
}
