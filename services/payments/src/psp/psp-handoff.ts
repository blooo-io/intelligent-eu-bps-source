/**
 * A7-bis — PspHandoff builders for EWDS command replies (REQ-052 / REQ-014 / REQ-051).
 * Never logs clientSecret or hosted URLs.
 */

export type PspHandoffPurposeHosted =
  | "checkout"
  | "setup"
  | "connect_onboarding"
  | "identity";

export type PspHandoffPurposeEmbedded =
  | "payment"
  | "setup"
  | "connect_onboarding"
  | "identity";

export type PspHandoff =
  | {
      surface: "hosted";
      provider: "stripe";
      purpose: PspHandoffPurposeHosted;
      url: string;
      expiresAt: string;
    }
  | {
      surface: "embedded";
      provider: "stripe";
      purpose: PspHandoffPurposeEmbedded;
      publishableKey: string;
      clientSecret: string;
      connectedAccountRef?: string;
      expiresAt: string;
    };

const DEFAULT_EXPIRES_MS = 60 * 60 * 1000;

/** Platform publishable key for embedded handoffs (pk_test_ / pk_live_). */
export function publishableKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key =
    env.stripe_publishable_key ??
    env.STRIPE_PUBLISHABLE_KEY ??
    env.stripe_test_publishable_key;
  if (typeof key === "string" && /^pk_(test|live)_/.test(key)) {
    return key;
  }
  // Mock / local default — public by design; never a secret key.
  return "pk_test_mock_intelligent_ac07";
}

export function defaultExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + DEFAULT_EXPIRES_MS).toISOString();
}

export function hostedHandoff(
  purpose: PspHandoffPurposeHosted,
  url: string,
  expiresAt?: string,
): PspHandoff {
  return {
    surface: "hosted",
    provider: "stripe",
    purpose,
    url,
    expiresAt: expiresAt ?? defaultExpiresAt(),
  };
}

export function embeddedHandoff(
  purpose: PspHandoffPurposeEmbedded,
  input: {
    clientSecret: string;
    publishableKey?: string;
    connectedAccountRef?: string;
    expiresAt?: string;
  },
): PspHandoff {
  return {
    surface: "embedded",
    provider: "stripe",
    purpose,
    publishableKey: input.publishableKey ?? publishableKeyFromEnv(),
    clientSecret: input.clientSecret,
    ...(input.connectedAccountRef
      ? { connectedAccountRef: input.connectedAccountRef }
      : {}),
    expiresAt: input.expiresAt ?? defaultExpiresAt(),
  };
}
