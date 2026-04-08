import type { DispatchPort } from "./dispatch.port.js";
import { MockDispatchAdapter } from "./mock-dispatch.adapter.js";
import { SdkTemporalClient } from "./sdk-temporal-client.js";
import { TemporalDispatchAdapter } from "./temporal-dispatch.adapter.js";

/**
 * INT-210 / INT-216 — Temporal when TEMPORAL_ADDRESS (or DISPATCH_PROVIDER=temporal);
 * mock when DISPATCH_PROVIDER=mock or address unset.
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
    const namespace = env.TEMPORAL_NAMESPACE ?? "int";
    return new TemporalDispatchAdapter(
      new SdkTemporalClient(address!, namespace),
    );
  }
  return new MockDispatchAdapter();
}
