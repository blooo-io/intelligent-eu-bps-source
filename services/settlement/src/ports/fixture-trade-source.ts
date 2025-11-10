import {
  createMockSuite,
  type ScenarioId,
  type MockSuite,
} from "@intelligent/mocks";
import type { UnbilledTrade } from "../domain/types.js";
import type { TradeSourcePort } from "./trade-source.port.js";

/**
 * V1 fixture trade source — maps AC-15 scenario settled trades to unbilled rows
 * until the HTTP client to AC-04 is wired.
 */
export class FixtureTradeSource implements TradeSourcePort {
  private suite: MockSuite;
  private billed = new Set<string>();

  constructor(scenarioId: ScenarioId = "S1") {
    this.suite = createMockSuite(scenarioId);
  }

  useScenario(scenarioId: ScenarioId): void {
    this.suite = createMockSuite(scenarioId);
    this.billed.clear();
  }

  communityId(): string {
    return this.suite.scenario.communityId;
  }

  currency(): "EUR" | "CHF" {
    return this.suite.scenario.currency;
  }

  async getUnbilled(
    communityId: string,
    _until: string,
  ): Promise<UnbilledTrade[]> {
    void _until;
    if (communityId !== this.suite.scenario.communityId) {
      return [];
    }
    return this.suite.scenario.trades
      .filter((t) => t.status === "settled" && !this.billed.has(t.tradeId))
      .filter((t) => !t.unknownParty)
      .map((t) => ({
        tradeId: t.tradeId,
        // Fixture uses participant UUIDs as actor ids.
        consumerId: t.buyerActorId,
        producerId: t.sellerActorId,
        communityId,
        kWh: t.energyKWh,
        pricePerKWhEur: t.pricePerKWhEur,
      }));
  }

  markBilled(tradeIds: string[]): void {
    for (const id of tradeIds) {
      this.billed.add(id);
    }
  }
}
