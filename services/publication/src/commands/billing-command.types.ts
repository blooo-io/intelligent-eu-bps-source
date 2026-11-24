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
