/**
 * INT-191 — create a Stripe Account Token via Stripe.js (FR Custom Connect).
 * PII goes to Stripe; billing only receives the token id.
 */

export type AccountTokenFields = {
  businessType: "individual" | "company";
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** INT-195 — required for FR individual KYC / charges_enabled. */
  dob?: { day: number; month: number; year: number };
  line1: string;
  city: string;
  postalCode: string;
  country: string;
  tosAccepted: boolean;
  /**
   * INT-195 — Stripe File id for identity document front
   * (`file_identity_document_success` in test mode, or uploads API id).
   */
  identityDocumentFront?: string;
  identityDocumentAdditionalFront?: string;
};

export type StripeAccountTokenClient = {
  createToken: (
    type: "account",
    data: Record<string, unknown>,
  ) => Promise<{ token?: { id: string }; error?: { message?: string } }>;
};

export type LoadStripeFn = (
  publishableKey: string,
) => Promise<StripeAccountTokenClient | null>;

/** Build Account Token params for an individual producer (INT-191 / INT-195). */
export function accountTokenParams(fields: AccountTokenFields): Record<string, unknown> {
  const individual: Record<string, unknown> = {
    first_name: fields.firstName,
    last_name: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    address: {
      line1: fields.line1,
      city: fields.city,
      postal_code: fields.postalCode,
      country: fields.country,
    },
  };
  if (fields.dob) {
    individual.dob = {
      day: fields.dob.day,
      month: fields.dob.month,
      year: fields.dob.year,
    };
  }
  // INT-195 — identity document recovers verification_failed_keyed_identity.
  if (fields.identityDocumentFront || fields.identityDocumentAdditionalFront) {
    const verification: Record<string, unknown> = {};
    if (fields.identityDocumentFront) {
      verification.document = { front: fields.identityDocumentFront };
    }
    if (fields.identityDocumentAdditionalFront) {
      verification.additional_document = {
        front: fields.identityDocumentAdditionalFront,
      };
    }
    individual.verification = verification;
  }
  return {
    business_type: fields.businessType,
    individual,
    tos_shown_and_accepted: fields.tosAccepted,
  };
}

/**
 * Create an account token with Stripe.js.
 * `loadStripe` is injectable for unit tests (default: @stripe/stripe-js).
 */
export async function createAccountToken(
  publishableKey: string,
  fields: AccountTokenFields,
  loadStripe: LoadStripeFn = defaultLoadStripe,
): Promise<string> {
  if (!publishableKey.startsWith("pk_test_")) {
    throw new Error("Stripe publishable key must be pk_test_… (BR-12)");
  }
  const stripe = await loadStripe(publishableKey);
  if (!stripe) {
    throw new Error("Stripe.js failed to load");
  }
  const result = await stripe.createToken("account", accountTokenParams(fields));
  if (result.error || !result.token?.id) {
    throw new Error(result.error?.message ?? "Account token creation failed");
  }
  return result.token.id;
}

async function defaultLoadStripe(
  publishableKey: string,
): Promise<StripeAccountTokenClient | null> {
  const { loadStripe } = await import("@stripe/stripe-js");
  const stripe = await loadStripe(publishableKey);
  if (!stripe) return null;
  return {
    createToken: (type, data) =>
      stripe.createToken(type, data as never) as Promise<{
        token?: { id: string };
        error?: { message?: string };
      }>,
  };
}
