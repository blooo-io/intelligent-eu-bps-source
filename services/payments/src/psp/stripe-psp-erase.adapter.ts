import { Inject, Injectable, Optional } from "@nestjs/common";
import Stripe from "stripe";
import type {
  PspEraseInput,
  PspErasePort,
  PspEraseResult,
} from "./psp-erase.port.js";
import { readStripeEnv, resolvePspProvider } from "./stripe-env.js";

/** Optional Nest token for the Stripe erase test seam (INT-438). */
export const STRIPE_ERASE_CLIENT = Symbol("STRIPE_ERASE_CLIENT");

type StripeCustomersDel = {
  del: (
    id: string,
    params?: unknown,
    opts?: { stripeAccount?: string },
  ) => Promise<unknown>;
};

type StripeAccountsDel = {
  del: (id: string) => Promise<unknown>;
};

/** Minimal Stripe surface used for GDPR erase (test seam). */
export type StripeEraseClient = {
  customers: StripeCustomersDel;
  accounts: StripeAccountsDel;
};

/**
 * REQ-013 / Task 3.18 — real Stripe erasure for AC-07.
 *
 * - Deletes every platform and connected Customer (`customers.del`).
 * - Deletes the Connect account in **test mode** only (`accounts.del`).
 * - In **live mode**, the account is retained under AML law
 *   (`retained_by_psp` / `aml_legal_obligation`); Stripe is an independent
 *   controller for KYC data (document in D5.5).
 */
@Injectable()
export class StripePspEraseAdapter implements PspErasePort {
  private readonly calls: PspEraseInput[] = [];
  private readonly stripe: StripeEraseClient;

  constructor(
    /**
     * Test seam — inject a stub instead of the live Stripe SDK.
     * Named token + `@Optional()` so Nest does not resolve the type alias as
     * `Object` (INT-438 CrashLoop: UnknownDependenciesException).
     */
    @Optional()
    @Inject(STRIPE_ERASE_CLIENT)
    stripeClient?: StripeEraseClient,
  ) {
    if (stripeClient) {
      this.stripe = stripeClient;
      return;
    }
    const creds = readStripeEnv();
    if (!creds?.secretKey) {
      // Lazily fail on erase if misconfigured; Nest still boots for mock mode.
      this.stripe = {
        customers: {
          del: async () => {
            throw new Error("Stripe erase adapter requires stripe_secret_key");
          },
        },
        accounts: {
          del: async () => {
            throw new Error("Stripe erase adapter requires stripe_secret_key");
          },
        },
      };
      return;
    }
    this.stripe = new Stripe(creds.secretKey) as unknown as StripeEraseClient;
  }

  recorded(): readonly PspEraseInput[] {
    return [...this.calls];
  }

  async erase(input: PspEraseInput): Promise<PspEraseResult> {
    if (resolvePspProvider() !== "stripe") {
      throw new Error("Stripe erase adapter requires PSP_PROVIDER=stripe");
    }
    this.calls.push({
      ...input,
      platformCustomerIds: [...input.platformCustomerIds],
      connectedCustomers: input.connectedCustomers.map((c) => ({ ...c })),
    });

    const hasCustomers =
      input.platformCustomerIds.length > 0 ||
      input.connectedCustomers.length > 0;
    const hasAccount = Boolean(input.pspAccountRef);
    if (!hasCustomers && !hasAccount) {
      return {
        ok: true,
        requestId: input.requestId,
        participantId: input.participantId,
        outcome: "nothing_to_erase",
      };
    }

    for (const customerId of input.platformCustomerIds) {
      await this.stripe.customers.del(customerId);
    }
    for (const linked of input.connectedCustomers) {
      await this.stripe.customers.del(linked.customerRef, undefined, {
        stripeAccount: linked.accountRef,
      });
    }

    if (input.livemode) {
      // Live Connect accounts are retained by Stripe under AML obligations.
      return {
        ok: true,
        requestId: input.requestId,
        participantId: input.participantId,
        outcome: "retained_by_psp",
        reason: "aml_legal_obligation",
      };
    }

    if (input.pspAccountRef) {
      await this.stripe.accounts.del(input.pspAccountRef);
    }

    return {
      ok: true,
      requestId: input.requestId,
      participantId: input.participantId,
      outcome: "erased",
    };
  }
}
