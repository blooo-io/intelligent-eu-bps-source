import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
export const PAYMENTS_CLIENT = Symbol("PAYMENTS_CLIENT");

/** Narrow client of AC-07 GetPaymentAccount (INT-228 / TP-7 / INT-231). */
export type PaymentAccountSnapshot = {
  stripeAccountId: string | null;
  chargesEnabled?: boolean;
};

export type PaymentsClientPort = {
  getProducerStripeAccountId(producerId: string): Promise<string | null>;
  /** INT-231 — full GetPaymentAccount including charges_enabled. */
  getPaymentAccount(producerId: string): Promise<PaymentAccountSnapshot | null>;
  /**
   * INT-355 / REQ-014 — AC-07 EnsureConnectedCustomer: the consumer's Customer
   * on the producer Connect account, billed by the self-billing invoice.
   */
  ensureConnectedCustomer(
    consumerId: string,
    stripeAccountId: string,
  ): Promise<string | null>;
};

/** CI / unit tests — no AC-07; callers fall back to registerConnectAccount / override. */
export class NoopPaymentsClient implements PaymentsClientPort {
  async getProducerStripeAccountId(_producerId: string): Promise<string | null> {
    return null;
  }

  async ensureConnectedCustomer(
    _consumerId: string,
    _stripeAccountId: string,
  ): Promise<string | null> {
    return null;
  }

  async getPaymentAccount(
    _producerId: string,
  ): Promise<PaymentAccountSnapshot | null> {
    return null;
  }
}

export class HttpPaymentsClient implements PaymentsClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getPaymentAccount(
    producerId: string,
  ): Promise<PaymentAccountSnapshot | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/payment-accounts/${producerId}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-06-invoicing", this.auth)),

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
    const body = (await res.json()) as {
      stripeAccountId?: string | null;
      chargesEnabled?: boolean;
    };
    return {
      stripeAccountId:
        typeof body.stripeAccountId === "string" && body.stripeAccountId.length > 0
          ? body.stripeAccountId
          : null,
      ...(typeof body.chargesEnabled === "boolean"
        ? { chargesEnabled: body.chargesEnabled }
        : {}),
    };
  }

  async getProducerStripeAccountId(producerId: string): Promise<string | null> {
    const account = await this.getPaymentAccount(producerId);
    return account?.stripeAccountId ?? null;
  }

  async ensureConnectedCustomer(
    consumerId: string,
    stripeAccountId: string,
  ): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/connected-customers:ensure`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await resolveServiceAuthHeaders("ac-06-invoicing", this.auth)),
      },
      body: JSON.stringify({ participantId: consumerId, stripeAccountId }),
    });
    if (!res.ok) {
      throw new Error(`payments ensureConnectedCustomer failed with ${res.status}`);
    }
    const body = (await res.json()) as { stripeCustomerId?: string };
    return typeof body.stripeCustomerId === "string" && body.stripeCustomerId.length > 0
      ? body.stripeCustomerId
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
