/**
 * REQ-052 / A7 — EWDS billing command request envelope (billingCommandRequest).
 */
export type BillingCommandOperation =
  | "startPayment"
  | "requestWithdrawal"
  | "setInvoiceStatus"
  | "startKyc"
  | "sendReminder"
  | "triggerBillingRun"
  | "setupPaymentMethod";

export type BillingCommandRequest = {
  requestId: string;
  operation: BillingCommandOperation;
  actorId: string;
  payload: Record<string, unknown>;
};

export type AuthzRole = "member" | "manager" | "operator";

export type AuthzDecision =
  | { allow: true; communityId: string; role: AuthzRole }
  | { allow: false; code: "forbidden" | "not_found" };

/** Invoice fields needed for role checks (maps InternalInvoice). */
export type InvoiceAuthzView = {
  invoiceId: string;
  communityId: string;
  /** Consumer / payer — int:invoiceIssuedTo. */
  invoiceIssuedTo: string;
  /** Producer / seller — int:invoiceIssuedBy. */
  invoiceIssuedBy: string;
};

export type ActorAuthzView = {
  actorId: string;
  status: "active" | "offboarded" | "unknown";
  memberships: Array<{
    communityId: string;
    role: AuthzRole;
    participantRole?: "consumer" | "producer" | "prosumer";
  }>;
};

/** A7-bis — Stripe-hosted or embedded handoff (never a Blooo URL). */
export type PspHandoff =
  | {
      surface: "hosted";
      provider: "stripe";
      purpose: "checkout" | "setup" | "connect_onboarding" | "identity";
      url: string;
      expiresAt: string;
    }
  | {
      surface: "embedded";
      provider: "stripe";
      purpose: "payment" | "setup" | "connect_onboarding" | "identity";
      publishableKey: string;
      clientSecret: string;
      connectedAccountRef?: string;
      expiresAt: string;
    };

export type BillingCommandErrorCode =
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "unavailable";

/** REQ-052 / A7 — EWDS billingCommandReply envelope. */
export type BillingCommandReply = {
  requestId: string;
  operation: BillingCommandOperation;
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: BillingCommandErrorCode; message: string };
};

/** Hosted Stripe URL allow-list (A7 / A7-bis). */
export const STRIPE_HOSTED_URL_RE =
  /^https:\/\/(checkout|connect|verify)\.stripe\.com\//;
