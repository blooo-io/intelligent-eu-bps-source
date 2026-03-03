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

/**
 * V1 UAT registry (INT-194) — bind Keycloak fixture subjects so `/v1/me` works
 * after pod restart without a live manager import. Managers may still import
 * more participants (REQ-008). IdP sub UUIDs match `int-realm.json` user ids.
 */
export function seedParticipants(): ParticipantRecord[] {
  const communityId = SEED_COMMUNITY_ID;
  return [
    {
      participantId: "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
      communityId,
      role: "consumer",
      status: "Invited",
      marketActorId: "mkt-uat-member",
      meterId: "m-uat-member",
      idpUserId: "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f",
      profile: {
        name: "UAT Member",
        address: "",
        email: "uat-member@example.invalid",
      },
      termsVersionAccepted: null,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
    {
      participantId: "2a3a56e5-2e71-4990-bf26-2b4708e4adcd",
      communityId,
      role: "prosumer",
      status: "Invited",
      marketActorId: "mkt-uat-manager",
      meterId: "m-uat-manager",
      idpUserId: "aca5adb7-0f18-4db8-aa04-6a0ff11b8ec6",
      profile: {
        name: "UAT Manager",
        address: "",
        email: "uat-manager@example.invalid",
      },
      termsVersionAccepted: null,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
    {
      participantId: "4e1933c8-368e-45f5-9751-ac975a2de45e",
      communityId,
      role: "consumer",
      status: "Invited",
      marketActorId: "mkt-uat-operator",
      meterId: "m-uat-operator",
      idpUserId: "e4166575-164a-4c30-b801-290fadd879d1",
      profile: {
        name: "UAT Operator",
        address: "",
        email: "uat-operator@example.invalid",
      },
      termsVersionAccepted: null,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
  ];
}
