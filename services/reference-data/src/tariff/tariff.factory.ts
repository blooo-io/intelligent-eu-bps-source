import { createEwdsTariffAdapter } from "./ewds-tariff.adapter.js";
import { MockTariffAdapter } from "./mock-tariff.adapter.js";
import type { TariffPort } from "./tariff.port.js";

/**
 * Select TariffPort from env.
 * `TARIFF_ADAPTER` / `TARIFF_PROVIDER` = mock|ewds (default mock).
 */
export function createTariffPort(
  env: NodeJS.ProcessEnv = process.env,
): TariffPort {
  const mode = (
    env.TARIFF_ADAPTER ??
    env.TARIFF_PROVIDER ??
    "mock"
  )
    .trim()
    .toLowerCase();
  if (mode === "ewds") {
    return createEwdsTariffAdapter(env);
  }
  return new MockTariffAdapter();
}
