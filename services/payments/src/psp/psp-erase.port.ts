/** Port to the payment provider for GDPR erasure (REQ-013 / Stripe Connect). */
export const PSP_ERASE_PORT = Symbol("PSP_ERASE_PORT");

export type PspEraseInput = {
  participantId: string;
  stripeCustomerId?: string;
  requestId: string;
};

export type PspEraseResult = {
  ok: boolean;
  requestId: string;
  participantId: string;
};

export interface PspErasePort {
  erase(input: PspEraseInput): Promise<PspEraseResult>;
  recorded(): readonly PspEraseInput[];
}
