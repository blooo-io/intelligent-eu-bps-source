export const PSP_ERASE_PORT = Symbol("PSP_ERASE_PORT");

/**
 * REQ-013 / Task 3.18 — inputs for PSP erasure.
 * `connectedCustomers` may be empty after INT-428 (connected-customers store removed).
 */
export type PspEraseInput = {
  participantId: string;
  pspAccountRef?: string;
  requestId: string;
  platformCustomerIds: string[];
  connectedCustomers: { accountRef: string; customerRef: string }[];
  livemode: boolean;
};

export type PspEraseOutcome =
  | "erased"
  | "retained_by_psp"
  | "nothing_to_erase";

export type PspEraseResult = {
  ok: boolean;
  requestId: string;
  participantId: string;
  outcome: PspEraseOutcome;
  /** Present when Stripe keeps KYC as an independent AML controller (live). */
  reason?: "aml_legal_obligation";
};

export interface PspErasePort {
  erase(input: PspEraseInput): Promise<PspEraseResult>;
  recorded(): readonly PspEraseInput[];
}
