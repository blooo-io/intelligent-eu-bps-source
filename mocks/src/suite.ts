import { createMockDataSpace } from "./dataspace/mock-dataspace.js";
import { createFxFixture } from "./fx/fx-fixture.js";
import { createMockMarket } from "./market/mock-market.js";
import { loadScenario } from "./scenarios/registry.js";
import type { MockSuite, ScenarioId } from "./types.js";

/** Build a mock suite bound to one V1 scenario dataset (INT-101 / AC-15). */
export function createMockSuite(scenarioId: ScenarioId): MockSuite {
  const scenario = loadScenario(scenarioId);
  return {
    scenario,
    market: createMockMarket(scenario),
    fx: createFxFixture(scenario),
    dataSpace: createMockDataSpace(),
  };
}
