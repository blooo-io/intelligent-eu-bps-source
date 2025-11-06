import type { CommunitySettings, ParticipantRecord, TermsDocument } from "./types.js";

/** Stable V1 fixture community (virtual mode — A1 / REQ-043). */
export const SEED_COMMUNITY_ID = "a1000000-0000-4000-8000-000000000001";

export const SEED_TERMS: TermsDocument = {
  termsVersion: "v1.0.0",
  text: "INTELLIGENT V1 terms and self-billing mandate (REQ-050). Identifiers only in events.",
};

export function seedCommunitySettings(): CommunitySettings {
  return {
    communityId: SEED_COMMUNITY_ID,
    currency: "EUR",
    billingPeriod: "monthly",
    // BR-04 threshold 5.00 with carry-forward.
    threshold: "5.00",
    // BR-07 default VAT until configured.
    vatRate: "0.00",
    billingMode: "virtual",
  };
}

/** Empty registry — managers import participants (REQ-008). */
export function seedParticipants(): ParticipantRecord[] {
  return [];
}
