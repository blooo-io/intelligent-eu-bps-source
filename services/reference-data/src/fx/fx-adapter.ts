/**
 * P-FX adapter — V1 uses AC-15 ECB fixture (INT-101 / INT-102, REQ-002).
 */
import { createFxFixture, loadScenario, type FxPort } from "@intelligent/mocks";

/** Build the V1 FX port from scenario S8 (CHF / ECB fixture). */
export function createV1FxPort(): FxPort {
  return createFxFixture(loadScenario("S8"));
}

/** Format a numeric rate as the contract Rate string (two decimal places, BR-08). */
export function formatRate(value: number): string {
  return value.toFixed(2);
}
