/**
 * REQ-050 — community manager T&C acceptance (distinct from member ParticipantRecord).
 * Identifiers only; no personal data (NFR-015).
 */
export type ManagerConsent = {
  subjectId: string;
  communityId: string;
  termsVersion: string;
  acceptedAt: string;
};

export function managerConsentKey(
  communityId: string,
  subjectId: string,
): string {
  return `${communityId}:${subjectId}`;
}
