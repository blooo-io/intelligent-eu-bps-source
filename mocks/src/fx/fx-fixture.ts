/** P-FX fixture — ECB reference rates from the active scenario (REQ-002). */
import type { FxPort, FxRate, ScenarioDataset } from "../types.js";

export function createFxFixture(scenario: ScenarioDataset): FxPort {
  return {
    getRate(currency: string, date: string): FxRate {
      const match = scenario.fxRates.find(
        (r) => r.targetCurrency === currency && r.rateDate === date,
      );
      if (match) {
        return { ...match };
      }
      // Fall back to any rate for that currency (V1 fixture table is small).
      const any = scenario.fxRates.find((r) => r.targetCurrency === currency);
      if (!any) {
        throw new Error(`No FX fixture for ${currency} on ${date}`);
      }
      return { ...any, rateDate: date };
    },
  };
}
