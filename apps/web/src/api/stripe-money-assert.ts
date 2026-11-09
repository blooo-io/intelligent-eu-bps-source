/**
 * INT-251 — assert real Stripe test-mode money movement after Pay.
 * INT-355 — Pay is a direct charge on the producer Connect account; AC-07 tags
 * that PaymentIntent (and so its charge) with `metadata.invoiceId`.
 */

export type StripeCharge = {
  id: string;
  status: string;
  paid: boolean;
  amount: number;
  currency: string;
  created: number;
  metadata?: Record<string, string>;
  payment_intent?: string | null;
};

export type StripeListResponse = {
  data: StripeCharge[];
};

/** Fail CI when the money assertion cannot talk to Stripe. */
export function requireStripeSecretKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = (env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "INT-251: STRIPE_SECRET_KEY (sk_test_…) required for money-path assertion",
    );
  }
  return key;
}

/**
 * List recent charges; optionally filter to those created at/after `createdAfter`
 * (unix seconds) and/or matching `invoiceId` metadata.
 */
export async function listStripeCharges(
  secretKey: string,
  opts: {
    limit?: number;
    createdAfter?: number;
    invoiceId?: string;
    /** INT-355 — read charges on a connected account (Stripe-Account header). */
    stripeAccount?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<StripeCharge[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 20));
  if (opts.createdAfter != null) {
    params.set("created[gte]", String(opts.createdAfter));
  }
  const res = await fetchImpl(
    `https://api.stripe.com/v1/charges?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
        ...(opts.stripeAccount ? { "Stripe-Account": opts.stripeAccount } : {}),
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Stripe GET /v1/charges failed with ${res.status}`);
  }
  const body = (await res.json()) as StripeListResponse;
  let rows = body.data ?? [];
  if (opts.invoiceId) {
    rows = rows.filter((c) => c.metadata?.invoiceId === opts.invoiceId);
  }
  return rows;
}

/** INT-355 — most recent connected accounts (fresh billing runs create new ones). */
export async function listRecentConnectedAccounts(
  secretKey: string,
  opts: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api.stripe.com/v1/accounts?limit=${opts.limit ?? 20}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Stripe GET /v1/accounts failed with ${res.status}`);
  }
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .map((a) => a.id)
    .filter((id): id is string => typeof id === "string" && id.startsWith("acct_"));
}

/**
 * Poll until a succeeded/paid charge exists for the invoice (TD-6 / REQ-014),
 * on the platform or on one of the recent producer Connect accounts (INT-355).
 */
export async function waitForSucceededChargeForInvoice(
  secretKey: string,
  invoiceId: string,
  opts: {
    createdAfter: number;
    timeoutMs?: number;
    pollMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<StripeCharge> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const pollMs = opts.pollMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const accounts = [
        undefined,
        ...(await listRecentConnectedAccounts(secretKey, {
          fetchImpl: opts.fetchImpl,
        })),
      ];
      for (const stripeAccount of accounts) {
        const charges = await listStripeCharges(secretKey, {
          createdAfter: opts.createdAfter,
          invoiceId,
          stripeAccount,
          fetchImpl: opts.fetchImpl,
        });
        const hit = charges.find(
          (c) => c.status === "succeeded" && c.paid === true,
        );
        if (hit) return hit;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `INT-251: no succeeded Stripe charge for invoice ${invoiceId} within ${timeoutMs}ms` +
      (lastError instanceof Error ? ` (${lastError.message})` : ""),
  );
}
