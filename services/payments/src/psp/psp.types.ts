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
  | "ignored";

export type PspEvent = {
  eventId: string;
  /** ISO timestamp — PSP event time. */
  occurredAt: string;
  kind: PspEventKind;
  pspAccountRef?: string;
  participantId?: string;
  invoiceId?: string;
  pspPaymentRef?: string;
  pspCheckoutRef?: string;
  pspPayoutRef?: string;
  method?: PspPaymentMethodType;
  failureCategory?: PspFailureCategory;
};
