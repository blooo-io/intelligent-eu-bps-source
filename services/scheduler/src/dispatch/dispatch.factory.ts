import type { DispatchPort } from "./dispatch.port.js";
import { MockDispatchAdapter } from "./mock-dispatch.adapter.js";
import {
  TemporalDispatchAdapter,
  UnconfiguredTemporalClient,
} from "./temporal-dispatch.adapter.js";

/**
 * INT-210 — mock by default; Temporal when TEMPORAL_ADDRESS (or DISPATCH_PROVIDER=temporal).
 */
export function createDispatchPort(
  env: NodeJS.ProcessEnv = process.env,
): DispatchPort {
  const provider = (env.DISPATCH_PROVIDER ?? "").toLowerCase();
  if (provider === "mock") {
    return new MockDispatchAdapter();
  }
  const address = env.TEMPORAL_ADDRESS ?? env.TEMPORAL_HOST;
  if (provider === "temporal" || address) {
    // SDK wiring lands with workers + TLS secrets; fail closed until linked.
    return new TemporalDispatchAdapter(new UnconfiguredTemporalClient());
  }
  return new MockDispatchAdapter();
}
