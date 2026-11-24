/**
 * REQ-043 / UAT-054 — PSP adapters per community billing mode.
 *
 * The codebase splits PSP into CollectPort / KycOnboardingPort / PspEventsPort
 * (etc.); PaymentsService still injects the concrete adapter (`MockPspAdapter` |
 * `StripePspAdapter`) as `PSP_ADAPTER`. This registry wraps that same adapter
 * type — not a fictional single PspPort — and selects test vs live by mode.
 */
import type { BillingMode } from "@intelligent/module-template";
import { MockPspAdapter } from "./mock-psp.adapter.js";
import type { PspEventVerification } from "./psp-events.port.js";
import type { PspEvent } from "./psp.types.js";
import {
  readStripeEnv,
  readStripeLiveEnv,
  resolvePspProvider,
  type StripeEnv,
} from "./stripe-env.js";
import { StripePspAdapter } from "./stripe-psp.adapter.js";

export type PspAdapter = MockPspAdapter | StripePspAdapter;

export type PspCapabilities = {
  provider: "stripe" | "mock";
  testConfigured: boolean;
  liveConfigured: boolean;
};

export type WebhookVerification =
  | { ok: false }
  | { ok: true; event: PspEvent; livemode: boolean };

export const PSP_REGISTRY = Symbol("PSP_REGISTRY");

export class PspRegistry {
  constructor(
    private readonly testAdapter: PspAdapter,
    private readonly liveAdapter: PspAdapter | null,
    private readonly provider: "stripe" | "mock",
  ) {}

  /** Select the adapter for a community billing mode (REQ-043). */
  for(mode: BillingMode): PspAdapter {
    if (mode === "live") {
      if (!this.liveAdapter) {
        throw new Error("live PSP not configured");
      }
      return this.liveAdapter;
    }
    return this.testAdapter;
  }

  capabilities(): PspCapabilities {
    return {
      provider: this.provider,
      testConfigured: true,
      liveConfigured: this.liveAdapter !== null,
    };
  }

  /**
   * Verify a webhook against test (then live) secrets.
   * Carries `livemode` for community billing-mode mismatch checks (REQ-043).
   */
  verifyWebhook(raw: string, sig: string): WebhookVerification {
    const test = this.testAdapter.verifyEvent(raw, sig);
    if (test.ok) {
      return {
        ok: true,
        event: test.event,
        livemode: test.event.livemode === true,
      };
    }
    if (this.liveAdapter) {
      const live = this.liveAdapter.verifyEvent(raw, sig);
      if (live.ok) {
        return {
          ok: true,
          event: live.event,
          livemode: live.event.livemode === true,
        };
      }
    }
    return { ok: false };
  }
}

/**
 * Build the registry from env. Mock provider never exposes a live adapter.
 * Stripe live adapter is created only when {@link readStripeLiveEnv} succeeds.
 */
export function createPspRegistry(
  env: NodeJS.ProcessEnv = process.env,
  testMock: MockPspAdapter = new MockPspAdapter(),
): PspRegistry {
  const provider = resolvePspProvider(env);
  if (provider === "stripe") {
    const testEnv = readStripeEnv(env);
    if (!testEnv) {
      throw new Error("PSP_PROVIDER=stripe requires stripe_secret_key");
    }
    const testAdapter = new StripePspAdapter(testEnv, undefined, {
      mode: "test",
    });
    const liveEnv = readStripeLiveEnv(env);
    const liveAdapter = liveEnv
      ? new StripePspAdapter(liveEnv, undefined, { mode: "live" })
      : null;
    return new PspRegistry(testAdapter, liveAdapter, "stripe");
  }
  // Mock — live keys are never configured (capabilities.liveConfigured=false).
  void (env as { _?: StripeEnv });
  return new PspRegistry(testMock, null, "mock");
}

/** Test helper — build a registry with explicit adapters. */
export function createTestPspRegistry(options: {
  test: PspAdapter;
  live?: PspAdapter | null;
  provider?: "stripe" | "mock";
}): PspRegistry {
  return new PspRegistry(
    options.test,
    options.live ?? null,
    options.provider ?? "mock",
  );
}

/** Re-export for callers that only need the verification shape. */
export type { PspEventVerification };
