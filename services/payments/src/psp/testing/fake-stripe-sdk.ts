/**
 * In-memory Stripe SDK subset for StripePspAdapter contract tests (WS5 Task 5.4 / INT-424).
 * Honours `idempotencyKey` and `stripeAccount` request options. No network.
 */

import { createHmac, randomUUID } from "node:crypto";

export type FakeRequestOptions = {
  idempotencyKey?: string;
  stripeAccount?: string;
};

type AccountRecord = {
  id: string;
  country: string;
  metadata: Record<string, string>;
  controller?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: {
    currently_due: string[];
    eventually_due: string[];
    pending_verification: string[];
  };
  settings: { payouts: { schedule: { interval: string } } };
  /** currency (lower) → available minor units */
  balances: Map<string, number>;
};

type CustomerRecord = {
  id: string;
  metadata: Record<string, string>;
  stripeAccount?: string;
};

type PaymentMethodRecord = {
  id: string;
  type: "card" | "sepa_debit";
  customer: string | null;
  card?: { brand: string; last4: string };
  sepa_debit?: { last4: string };
  /** When true, confirming a PaymentIntent with this PM declines. */
  decline?: boolean;
  stripeAccount?: string;
};

type ChargeRecord = {
  id: string;
  payment_intent: string;
  balance_transaction: {
    id: string;
    fee: number;
    currency: string;
    available_on: number;
  } | null;
  payment_method_details: { type: "card" | "sepa_debit" };
  metadata: Record<string, string>;
};

type PaymentIntentRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer?: string;
  payment_method?: string;
  metadata: Record<string, string>;
  latest_charge: ChargeRecord | string | null;
  last_payment_error?: { code?: string; decline_code?: string };
  payment_method_types?: string[];
  stripeAccount?: string;
};

type CheckoutSessionRecord = {
  id: string;
  url: string;
  expires_at: number;
  payment_intent: string | null;
  metadata: Record<string, string>;
  stripeAccount?: string;
};

type PayoutRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, string>;
  stripeAccount?: string;
};

function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
}

function optKey(
  method: string,
  idempotencyKey: string | undefined,
  stripeAccount: string | undefined,
): string | undefined {
  if (!idempotencyKey) return undefined;
  return `${method}|${stripeAccount ?? "platform"}|${idempotencyKey}`;
}

/**
 * Minimal Stripe stand-in. Test helpers (`completeKyc`, `fundBalance`, …) drive
 * the contract harness; resource methods mirror the Stripe SDK call shapes the
 * adapter uses.
 *
 * Return type is inferred (do not annotate as FakeStripe — that alias is
 * derived from this function and would circularly reference itself).
 */
export function createFakeStripe(webhookSecret = "whsec_fake_test") {
  const accounts = new Map<string, AccountRecord>();
  const customers = new Map<string, CustomerRecord>();
  const paymentMethods = new Map<string, PaymentMethodRecord>();
  const paymentIntents = new Map<string, PaymentIntentRecord>();
  const checkouts = new Map<string, CheckoutSessionRecord>();
  const payouts = new Map<string, PayoutRecord>();
  const idempotent = new Map<string, unknown>();

  // Seed reusable test tokens used by the contract harness / UAT fixtures.
  paymentMethods.set("pm_card_visa", {
    id: "pm_card_visa",
    type: "card",
    customer: null,
    card: { brand: "visa", last4: "4242" },
  });
  paymentMethods.set("pm_card_chargeDeclined", {
    id: "pm_card_chargeDeclined",
    type: "card",
    customer: null,
    card: { brand: "visa", last4: "0002" },
    decline: true,
  });
  paymentMethods.set("pm_sepa_debit", {
    id: "pm_sepa_debit",
    type: "sepa_debit",
    customer: null,
    sepa_debit: { last4: "3000" },
  });

  function remember<T>(key: string | undefined, factory: () => T): T {
    if (!key) return factory();
    const hit = idempotent.get(key);
    if (hit !== undefined) return hit as T;
    const value = factory();
    idempotent.set(key, value);
    return value;
  }

  function getAccount(id: string): AccountRecord {
    const a = accounts.get(id);
    if (!a) throw Object.assign(new Error("No such account"), { code: "resource_missing" });
    return a;
  }

  const fake = {
    _webhookSecret: webhookSecret,

    /** Test helper — mark KYC complete (charges + payouts enabled). */
    completeKyc(accountId: string): void {
      const a = getAccount(accountId);
      a.charges_enabled = true;
      a.payouts_enabled = true;
      a.details_submitted = true;
      a.requirements = {
        currently_due: [],
        eventually_due: [],
        pending_verification: [],
      };
    },

    /** Test helper — credit available balance (minor units via decimal string). */
    fundBalance(accountId: string, amount: string, currency: string): void {
      const a = getAccount(accountId);
      const cur = currency.toLowerCase();
      const [whole, frac = ""] = amount.split(".");
      const minor = Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
      a.balances.set(cur, (a.balances.get(cur) ?? 0) + minor);
    },

    accounts: {
      create: async (
        params: {
          country?: string;
          metadata?: Record<string, string>;
          controller?: Record<string, unknown>;
          capabilities?: Record<string, unknown>;
          account_token?: string;
          settings?: { payouts?: { schedule?: { interval?: string } } };
        },
        _opts?: FakeRequestOptions,
      ) => {
        const id = shortId("acct");
        const record: AccountRecord = {
          id,
          country: (params.country ?? "FR").toUpperCase(),
          metadata: { ...(params.metadata ?? {}) },
          controller: params.controller,
          capabilities: params.capabilities,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          requirements: {
            currently_due: ["business_profile.url", "external_account"],
            eventually_due: [],
            pending_verification: [],
          },
          settings: {
            payouts: {
              schedule: {
                interval: params.settings?.payouts?.schedule?.interval ?? "daily",
              },
            },
          },
          balances: new Map(),
        };
        accounts.set(id, record);
        return { ...record, requirements: { ...record.requirements } };
      },

      retrieve: async (id: string) => {
        const a = getAccount(id);
        return {
          id: a.id,
          country: a.country,
          metadata: { ...a.metadata },
          charges_enabled: a.charges_enabled,
          payouts_enabled: a.payouts_enabled,
          details_submitted: a.details_submitted,
          requirements: {
            currently_due: [...a.requirements.currently_due],
            eventually_due: [...a.requirements.eventually_due],
            pending_verification: [...a.requirements.pending_verification],
          },
          settings: {
            payouts: { schedule: { interval: a.settings.payouts.schedule.interval } },
          },
        };
      },

      update: async (
        id: string,
        params: {
          settings?: { payouts?: { schedule?: { interval?: string } } };
          account_token?: string;
          business_profile?: { url?: string; mcc?: string };
          external_account?: Record<string, unknown>;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          details_submitted?: boolean;
          requirements?: AccountRecord["requirements"];
        },
      ) => {
        const a = getAccount(id);
        if (params.settings?.payouts?.schedule?.interval) {
          a.settings.payouts.schedule.interval =
            params.settings.payouts.schedule.interval;
        }
        if (params.charges_enabled !== undefined) {
          a.charges_enabled = params.charges_enabled;
        }
        if (params.payouts_enabled !== undefined) {
          a.payouts_enabled = params.payouts_enabled;
        }
        if (params.details_submitted !== undefined) {
          a.details_submitted = params.details_submitted;
        }
        if (params.requirements) {
          a.requirements = {
            currently_due: [...params.requirements.currently_due],
            eventually_due: [...params.requirements.eventually_due],
            pending_verification: [...params.requirements.pending_verification],
          };
        }
        if (params.business_profile?.url) {
          a.requirements.currently_due = a.requirements.currently_due.filter(
            (k) => k !== "business_profile.url",
          );
        }
        if (params.external_account) {
          a.requirements.currently_due = a.requirements.currently_due.filter(
            (k) => k !== "external_account",
          );
        }
        return fake.accounts.retrieve(id);
      },
    },

    accountLinks: {
      create: async (params: {
        account: string;
        type: string;
        return_url?: string;
        refresh_url?: string;
      }) => {
        getAccount(params.account);
        const expires = Math.floor(Date.now() / 1000) + 3600;
        return {
          object: "account_link",
          url: `https://connect.stripe.com/setup/e/${params.account}/${shortId("link")}`,
          expires_at: expires,
        };
      },
    },

    accountSessions: {
      create: async (params: {
        account: string;
        components?: Record<string, unknown>;
      }) => {
        getAccount(params.account);
        return {
          object: "account_session",
          client_secret: `accs_secret_test_${params.account}_${shortId("s")}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        };
      },
    },

    customers: {
      create: async (
        params: { metadata?: Record<string, string> },
        opts?: FakeRequestOptions,
      ) => {
        const id = shortId("cus");
        const record: CustomerRecord = {
          id,
          metadata: { ...(params.metadata ?? {}) },
          stripeAccount: opts?.stripeAccount,
        };
        customers.set(id, record);
        return { id, metadata: { ...record.metadata } };
      },

      retrieve: async (id: string) => {
        const c = customers.get(id);
        if (!c) {
          throw Object.assign(new Error("No such customer"), {
            code: "resource_missing",
          });
        }
        return { id: c.id, metadata: { ...c.metadata } };
      },

      search: async (_params: { query: string; limit?: number }) => {
        return { data: [] as Array<{ id: string }> };
      },
    },

    paymentMethods: {
      retrieve: async (id: string, _params?: unknown, _opts?: FakeRequestOptions) => {
        const pm = paymentMethods.get(id);
        if (!pm) {
          // Unknown ids behave as cards (legacy attach tests).
          return {
            id,
            type: "card" as const,
            customer: null,
            card: { brand: "visa", last4: "4242" },
          };
        }
        return {
          id: pm.id,
          type: pm.type,
          customer: pm.customer,
          card: pm.card,
          sepa_debit: pm.sepa_debit,
        };
      },

      create: async (
        params: { customer?: string; payment_method?: string; type?: string },
        opts?: FakeRequestOptions,
      ) => {
        const source = params.payment_method
          ? paymentMethods.get(params.payment_method)
          : undefined;
        const id = shortId("pm");
        const record: PaymentMethodRecord = {
          id,
          type: source?.type ?? "card",
          customer: null,
          card: source?.card ?? { brand: "visa", last4: "4242" },
          sepa_debit: source?.sepa_debit,
          decline: source?.decline,
          stripeAccount: opts?.stripeAccount,
        };
        paymentMethods.set(id, record);
        return {
          id,
          type: record.type,
          customer: null,
          card: record.card,
          sepa_debit: record.sepa_debit,
        };
      },

      attach: async (
        id: string,
        params: { customer: string },
        opts?: FakeRequestOptions,
      ) => {
        let pm = paymentMethods.get(id);
        if (!pm) {
          pm = {
            id,
            type: "card",
            customer: params.customer,
            card: { brand: "visa", last4: "4242" },
            stripeAccount: opts?.stripeAccount,
          };
          paymentMethods.set(id, pm);
        } else {
          pm.customer = params.customer;
        }
        return {
          id: pm.id,
          type: pm.type,
          customer: pm.customer,
          card: pm.card,
          sepa_debit: pm.sepa_debit,
        };
      },

      list: async (params: {
        customer: string;
        type?: string;
        limit?: number;
      }) => {
        const data = [...paymentMethods.values()].filter(
          (pm) =>
            pm.customer === params.customer &&
            (!params.type || pm.type === params.type),
        );
        return { data: data.slice(0, params.limit ?? 10) };
      },
    },

    setupIntents: {
      create: async (params: {
        customer?: string;
        usage?: string;
        allowed_payment_method_types?: string[];
        metadata?: Record<string, string>;
      }) => {
        const id = shortId("seti");
        return {
          id,
          client_secret: `${id}_secret_test`,
          customer: params.customer,
          metadata: params.metadata ?? {},
        };
      },
    },

    paymentIntents: {
      create: async (
        params: {
          amount: number;
          currency: string;
          customer?: string;
          payment_method?: string;
          confirm?: boolean;
          off_session?: boolean;
          metadata?: Record<string, string>;
        },
        opts?: FakeRequestOptions,
      ) => {
        const key = optKey("pi.create", opts?.idempotencyKey, opts?.stripeAccount);
        return remember(key, () => {
          const pm = params.payment_method
            ? paymentMethods.get(params.payment_method)
            : undefined;
          const id = shortId("pi");

          if (pm?.decline || params.payment_method?.includes("decline")) {
            const err = Object.assign(new Error("Your card was declined."), {
              type: "card_error",
              code: "card_declined",
              decline_code: "generic_decline",
              payment_intent: { id },
            });
            // Store a failed PI so retrieve still works for the error path.
            paymentIntents.set(id, {
              id,
              amount: params.amount,
              currency: params.currency,
              status: "requires_payment_method",
              customer: params.customer,
              payment_method: params.payment_method,
              metadata: { ...(params.metadata ?? {}) },
              latest_charge: null,
              last_payment_error: {
                code: "card_declined",
                decline_code: "generic_decline",
              },
              payment_method_types: ["card"],
              stripeAccount: opts?.stripeAccount,
            });
            throw err;
          }

          const chargeId = shortId("ch");
          const fee = Math.round(params.amount * 0.015) + 25;
          const charge: ChargeRecord = {
            id: chargeId,
            payment_intent: id,
            balance_transaction: {
              id: shortId("txn"),
              fee,
              currency: params.currency.toLowerCase(),
              available_on: Math.floor(Date.now() / 1000) + 86400,
            },
            payment_method_details: { type: pm?.type ?? "card" },
            metadata: { ...(params.metadata ?? {}) },
          };

          const record: PaymentIntentRecord = {
            id,
            amount: params.amount,
            currency: params.currency,
            status: "succeeded",
            customer: params.customer,
            payment_method: params.payment_method,
            metadata: { ...(params.metadata ?? {}) },
            latest_charge: charge,
            payment_method_types: [pm?.type ?? "card"],
            stripeAccount: opts?.stripeAccount,
          };
          paymentIntents.set(id, record);
          return {
            id,
            amount: record.amount,
            currency: record.currency,
            status: record.status,
            customer: record.customer,
            payment_method: record.payment_method,
            metadata: { ...record.metadata },
            latest_charge: chargeId,
            payment_method_types: record.payment_method_types,
          };
        });
      },

      retrieve: async (
        id: string,
        params?: { expand?: string[] },
        _opts?: FakeRequestOptions,
      ) => {
        const pi = paymentIntents.get(id);
        if (!pi) {
          throw Object.assign(new Error("No such payment_intent"), {
            code: "resource_missing",
          });
        }
        const expand = params?.expand ?? [];
        let latest: ChargeRecord | string | null = pi.latest_charge;
        if (
          typeof latest === "object" &&
          latest &&
          !expand.includes("latest_charge.balance_transaction")
        ) {
          latest = {
            ...latest,
            balance_transaction: latest.balance_transaction
              ? latest.balance_transaction.id
              : null,
          } as unknown as ChargeRecord;
        }
        if (expand.includes("latest_charge") || expand.includes("latest_charge.balance_transaction")) {
          return {
            id: pi.id,
            amount: pi.amount,
            currency: pi.currency,
            status: pi.status,
            metadata: { ...pi.metadata },
            latest_charge: latest,
            payment_method_types: pi.payment_method_types,
            last_payment_error: pi.last_payment_error,
          };
        }
        return {
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          metadata: { ...pi.metadata },
          latest_charge:
            typeof pi.latest_charge === "object" && pi.latest_charge
              ? pi.latest_charge.id
              : pi.latest_charge,
          payment_method_types: pi.payment_method_types,
          last_payment_error: pi.last_payment_error,
        };
      },

      update: async (
        id: string,
        params: { metadata?: Record<string, string> },
        _opts?: FakeRequestOptions,
      ) => {
        const pi = paymentIntents.get(id);
        if (!pi) {
          // Allow tagging before create in legacy invoice flows.
          return {
            id,
            metadata: params.metadata ?? {},
            latest_charge: null,
          };
        }
        if (params.metadata) {
          pi.metadata = { ...pi.metadata, ...params.metadata };
        }
        return {
          id: pi.id,
          metadata: { ...pi.metadata },
          latest_charge:
            typeof pi.latest_charge === "object" && pi.latest_charge
              ? pi.latest_charge.id
              : pi.latest_charge,
        };
      },
    },

    checkout: {
      sessions: {
        create: async (
          params: {
            mode?: string;
            success_url?: string;
            cancel_url?: string;
            customer?: string;
            line_items?: unknown[];
            payment_method_types?: string[];
            payment_intent_data?: {
              metadata?: Record<string, string>;
              setup_future_usage?: string;
            };
            metadata?: Record<string, string>;
          },
          opts?: FakeRequestOptions,
        ) => {
          const key = optKey(
            "cs.create",
            opts?.idempotencyKey,
            opts?.stripeAccount,
          );
          return remember(key, () => {
            const id = shortId("cs");
            const expires_at = Math.floor(Date.now() / 1000) + 3600;
            const record: CheckoutSessionRecord = {
              id,
              url: `https://checkout.stripe.com/c/pay/${id}`,
              expires_at,
              payment_intent: null,
              metadata: {
                ...(params.metadata ?? {}),
                ...(params.payment_intent_data?.metadata ?? {}),
              },
              stripeAccount: opts?.stripeAccount,
            };
            checkouts.set(id, record);
            return {
              id,
              url: record.url,
              expires_at,
              payment_intent: null,
              metadata: { ...record.metadata },
            };
          });
        },
      },
    },

    balance: {
      retrieve: async (_params?: unknown, opts?: FakeRequestOptions) => {
        if (!opts?.stripeAccount) {
          return { available: [] as Array<{ amount: number; currency: string }> };
        }
        const a = getAccount(opts.stripeAccount);
        return {
          available: [...a.balances.entries()].map(([currency, amount]) => ({
            amount,
            currency,
          })),
        };
      },
    },

    payouts: {
      create: async (
        params: {
          amount: number;
          currency: string;
          metadata?: Record<string, string>;
        },
        opts?: FakeRequestOptions,
      ) => {
        const key = optKey("po.create", opts?.idempotencyKey, opts?.stripeAccount);
        return remember(key, () => {
          if (!opts?.stripeAccount) {
            throw Object.assign(new Error("stripeAccount required"), {
              code: "parameter_missing",
            });
          }
          const a = getAccount(opts.stripeAccount);
          const cur = params.currency.toLowerCase();
          const available = a.balances.get(cur) ?? 0;
          if (params.amount > available) {
            throw Object.assign(new Error("Insufficient balance"), {
              code: "balance_insufficient",
              type: "invalid_request_error",
            });
          }
          a.balances.set(cur, available - params.amount);
          const id = shortId("po");
          const record: PayoutRecord = {
            id,
            amount: params.amount,
            currency: cur,
            status: "pending",
            metadata: { ...(params.metadata ?? {}) },
            stripeAccount: opts.stripeAccount,
          };
          payouts.set(id, record);
          return {
            id,
            amount: record.amount,
            currency: record.currency,
            status: record.status,
            metadata: { ...record.metadata },
          };
        });
      },
    },

    charges: {
      update: async (
        id: string,
        params: { metadata?: Record<string, string> },
        _opts?: FakeRequestOptions,
      ) => {
        return { id, metadata: params.metadata ?? {} };
      },
    },

    refunds: {
      create: async (
        params: { payment_intent?: string },
        _opts?: FakeRequestOptions,
      ) => {
        return { id: shortId("re"), payment_intent: params.payment_intent };
      },
    },

    tokens: {
      create: async (params: { account?: unknown }) => {
        void params;
        return { id: shortId("ct_test") };
      },
    },

    invoices: {
      retrieve: async (
        id: string,
        _params?: unknown,
        _opts?: FakeRequestOptions,
      ) => {
        return {
          id,
          status: "open",
          amount_due: 0,
          currency: "eur",
          customer: null,
          payments: { data: [] },
        };
      },
      pay: async (
        id: string,
        _params?: unknown,
        _opts?: FakeRequestOptions,
      ) => {
        return {
          id,
          status: "paid",
          payments: { data: [] },
        };
      },
    },

    webhooks: {
      constructEvent: (
        rawBody: string,
        signature: string,
        secret: string,
      ): Record<string, unknown> => {
        const expected = createHmac("sha256", secret)
          .update(rawBody, "utf8")
          .digest("hex");
        const ok =
          signature === `t=1,v1=${expected}` ||
          signature.split(",").some((part) => part === `v1=${expected}`);
        if (!ok) {
          throw new Error("Webhook signature verification failed");
        }
        return JSON.parse(rawBody) as Record<string, unknown>;
      },
    },
  };

  return fake;
}

/** Inferred FakeStripe shape — declared after createFakeStripe to avoid a circular alias. */
export type FakeStripe = ReturnType<typeof createFakeStripe>;

/** Sign a raw webhook body the way {@link createFakeStripe} verifies. */
export function signFakeStripeEvent(
  rawBody: string,
  secret = "whsec_fake_test",
): string {
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  return `t=1,v1=${expected}`;
}
