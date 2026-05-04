export const PAYMENTS_CLIENT = Symbol("PAYMENTS_CLIENT");

/** Narrow client of AC-07 GetPaymentAccount (INT-228 / TP-7). */
export type PaymentsClientPort = {
  getProducerStripeAccountId(producerId: string): Promise<string | null>;
};

/** CI / unit tests — no AC-07; callers fall back to registerConnectAccount / override. */
export class NoopPaymentsClient implements PaymentsClientPort {
  async getProducerStripeAccountId(_producerId: string): Promise<string | null> {
    return null;
  }
}

export class HttpPaymentsClient implements PaymentsClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getProducerStripeAccountId(producerId: string): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/payment-accounts/${producerId}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-06-invoicing",
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `payments getPaymentAccount ${producerId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as { stripeAccountId?: string | null };
    return typeof body.stripeAccountId === "string" && body.stripeAccountId.length > 0
      ? body.stripeAccountId
      : null;
  }
}

export function createPaymentsClient(
  env: NodeJS.ProcessEnv = process.env,
): PaymentsClientPort {
  const base = env.PAYMENTS_INTERNAL_URL;
  if (base) {
    return new HttpPaymentsClient(base);
  }
  return new NoopPaymentsClient();
}

/** True when AC-06 talks to live Stripe (must not invent acct_test_*). */
export function isLiveStripeInvoiceProvider(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicit = (
    env.STRIPE_INVOICE_PROVIDER ??
    env.stripe_invoice_provider ??
    env.PSP_PROVIDER ??
    env.psp_provider ??
    ""
  ).toLowerCase();
  return explicit === "stripe";
}
