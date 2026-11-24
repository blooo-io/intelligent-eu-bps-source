/** PSP-neutral value types (WS5 Task 5.2 / INT-424). No Stripe identifiers. */

export type PspPaymentMethodType = "card" | "sepa_debit";

export type PspFailureCategory =
  | "card_declined"
  | "insufficient_funds"
  | "authentication_required"
  | "mandate_invalid"
  | "bank_account_invalid"
  | "provider_error"
  | "other";

export type PspErrorCode =
  | "insufficient_balance"
  | "account_not_ready"
  | "invalid_request"
  | "provider_unavailable";

export class PspError extends Error {
  constructor(
    readonly code: PspErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PspError";
  }
}

export type PspEventKind =
  | "account.updated"
  | "checkout.completed"
  | "payment.processing"
  | "payment.succeeded"
  | "payment.failed"
  | "payout.paid"
  | "payout.failed"
  | "payout.canceled"
  | "identity.verification_session.verified"
  | "identity.verification_session.requires_input"
  | "identity.verification_session.canceled"
  | "ignored";

export type PspEvent = {
  eventId: string;
  /** ISO timestamp — PSP event time. */
  occurredAt: string;
  kind: PspEventKind;
  /**
   * REQ-043 — whether the PSP event was produced in live mode.
   * Used to ignore livemode mismatches against the community billing mode.
   */
  livemode?: boolean;
  pspAccountRef?: string;
  participantId?: string;
  invoiceId?: string;
  pspPaymentRef?: string;
  pspCheckoutRef?: string;
  pspPayoutRef?: string;
  /** Stripe Identity verification session id (REQ-051). */
  verificationId?: string;
  /** Payout events — expected arrival date (YYYY-MM-DD). */
  arrivalDate?: string;
  method?: PspPaymentMethodType;
  failureCategory?: PspFailureCategory;
};
