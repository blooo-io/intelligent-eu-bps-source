import {
  createMockSuite,
  type ScenarioId,
  type MockSuite,
} from "@intelligent/mocks";
import type { UnbilledTrade } from "../domain/types.js";
import type { TradeSourcePort } from "./trade-source.port.js";
import {
  type BilledTradesStore,
  InMemoryBilledTradesStore,
} from "./billed-trades.store.js";

/**
 * V1 fixture trade source — maps AC-15 scenario settled trades to unbilled rows
 * when TRADE_INTAKE_INTERNAL_URL is unset (INT-232 HttpTradeSource otherwise).
 * INT-225 — billed set is backed by BilledTradesStore (Postgres when DATABASE_URL set).
 */
export class FixtureTradeSource implements TradeSourcePort {
  private suite: MockSuite;
  private billed = new Set<string>();
  private readonly store: BilledTradesStore;

  constructor(
    scenarioId: ScenarioId = "S1",
    store: BilledTradesStore = new InMemoryBilledTradesStore(),
  ) {
    this.suite = createMockSuite(scenarioId);
    this.store = store;
  }

  /** Load durable billed ids (call once at module boot). */
  async hydrate(): Promise<void> {
    this.billed = await this.store.load();
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

  async markBilled(tradeIds: string[]): Promise<void> {
    for (const id of tradeIds) {
      this.billed.add(id);
    }
    await this.store.mark(tradeIds);
  }

  /** INT-228 — allow seed/runs to re-settle the same fixture trades. */
  async resetBilled(): Promise<void> {
    this.billed.clear();
    await this.store.clear();
  }
}
