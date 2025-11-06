import type { ParticipantRecord, ReadinessStatus } from "../domain/types.js";

/**
 * Derive readiness from profile, terms and payment-account gates (02 §5, BR-09).
 * Offboarded / Restricted are sticky until explicitly cleared.
 */
export function deriveReadiness(row: ParticipantRecord): ReadinessStatus {
  if (row.status === "Offboarded") {
    return "Offboarded";
  }
  // Restricted is driven by payment/KYC block (PaymentAccountStatusChanged), not a sticky label.
  if (row.paymentBlockReason || (row.status === "Restricted" && !row.paymentAccountReady)) {
    return "Restricted";
  }
  const profileOk =
    row.profile !== null &&
    row.profile.name.trim().length > 0 &&
    row.profile.address.trim().length > 0 &&
    row.profile.email.trim().length > 0;
  if (!profileOk) {
    return "Invited";
  }
  if (!row.termsVersionAccepted) {
    return "ProfileCompleted";
  }
  if (!row.paymentAccountReady) {
    return "TermsAccepted";
  }
  return "Ready";
}

export function isInvoiceReady(status: ReadinessStatus): boolean {
  // BR-09: invoice in the producer's name only when Ready.
  return status === "Ready";
}
