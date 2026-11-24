/**
 * REQ-042 / BR-10 / A6 — billing-owned legal invoice numbers.
 * Format: SB-<first 8 hex of producerId, upper case>-<6-digit sequence>.
 */
export function formatLegalNumber(producerId: string, seq: number): string {
  const hex = producerId.replaceAll("-", "").slice(0, 8).toUpperCase();
  return `SB-${hex}-${String(seq).padStart(6, "0")}`;
}

/** Parse the sequence suffix from an SB-… legal number, or 0 when malformed. */
export function legalNumberSeq(legalNumber: string | null | undefined): number {
  if (!legalNumber) return 0;
  const suffix = legalNumber.split("-").pop();
  const n = Number(suffix);
  return Number.isFinite(n) ? n : 0;
}
