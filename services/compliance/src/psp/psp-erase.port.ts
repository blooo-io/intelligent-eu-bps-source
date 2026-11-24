/** Port to the payment provider for GDPR erasure (REQ-013 / Stripe Connect). */
export const PSP_ERASE_PORT = Symbol("PSP_ERASE_PORT");

export type PspEraseInput = {
  participantId: string;
  /** Stripe customer / account id when known — identifiers only. */
  stripeCustomerId?: string;
  requestId: string;
};

/** Outcome from AC-07 erase-at-psp (REQ-013 / Task 3.21). */
export type PspEraseOutcome =
  | "erased"
  | "retained_by_psp"
  | "nothing_to_erase";

export type PspEraseResult = {
  ok: boolean;
  requestId: string;
  participantId: string;
  outcome?: PspEraseOutcome;
  /** Present when Stripe keeps KYC as an independent AML controller (live). */
  reason?: "aml_legal_obligation";
};

export interface PspErasePort {
  erase(input: PspEraseInput): Promise<PspEraseResult>;
  recorded(): readonly PspEraseInput[];
}
