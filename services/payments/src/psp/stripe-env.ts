/**
 * Resolve Stripe credentials from OpenBao → External Secrets env keys (INT-186 / INT-189).
 * Prefer lowercase seed keys; accept STRIPE_* for local operator overrides.
 */
export type StripeEnv = {
  secretKey: string;
  webhookSecret: string;
  connectWebhookSecret: string;
};

export function readStripeEnv(env: NodeJS.ProcessEnv = process.env): StripeEnv | null {
  const secretKey = env.stripe_secret_key ?? env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  return {
    secretKey,
    webhookSecret: env.stripe_webhook_secret ?? env.STRIPE_WEBHOOK_SECRET ?? "",
    connectWebhookSecret:
      env.stripe_connect_webhook_secret ?? env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "",
  };
}

/**
 * AD-6 — mock by default; `PSP_PROVIDER=stripe` selects the real test adapter.
 * Secrets alone do not flip the provider (avoids CI/agent env pollution).
 */
export function resolvePspProvider(
  env: NodeJS.ProcessEnv = process.env,
): "stripe" | "mock" {
  const explicit = (env.PSP_PROVIDER ?? env.psp_provider ?? "").toLowerCase();
  return explicit === "stripe" ? "stripe" : "mock";
}

export function resolveStripeInvoiceProvider(
  env: NodeJS.ProcessEnv = process.env,
): "stripe" | "mock" {
  const explicit = (
    env.STRIPE_INVOICE_PROVIDER ??
    env.stripe_invoice_provider ??
    env.PSP_PROVIDER ??
    env.psp_provider ??
    ""
  ).toLowerCase();
  return explicit === "stripe" ? "stripe" : "mock";
}

/** Convert a decimal money string to Stripe minor units (EUR/CHF = 2 decimals). */
export function toMinorUnits(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    throw new TypeError(`Invalid amount: ${amount}`);
  }
  return Math.round(n * 100);
}
