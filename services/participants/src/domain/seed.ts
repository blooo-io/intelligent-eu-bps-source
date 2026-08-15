import type { CommunitySettings, ParticipantRecord, TermsDocument } from "./types.js";

/** Stable V1 fixture community (virtual mode — A1 / REQ-043). */
export const SEED_COMMUNITY_ID = "a1000000-0000-4000-8000-000000000001";

/**
 * INT-230 — AC-15 S1 community id used by FixtureTradeSource / settlement /
 * stripe-fresh-billing-run. Seeded into AC-03 so CheckReadiness and
 * payment-account-status resolve the same UUIDs as invoices and Connect accounts.
 */
export const S1_COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
export const S1_CONSUMER_ID = "11111111-2222-4333-8444-555555555555";
export const S1_PRODUCER_A_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa";
export const S1_PRODUCER_B_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
/** INT-241 — S1 community manager (Start billing run from the portal). */
export const S1_MANAGER_ID = "dddddddd-eeee-4fff-8000-111111111111";
/** INT-285 — Invited consumer on Horizon Energy for full onboarding demo. */
export const S1_INVITED_ID = "e1000000-0000-4000-8000-000000000001";

/**
 * INT-236 / INT-241 / INT-285 — Keycloak user ids for S1 actors (`int-realm.json` /
 * ensure script). Distinct from participantIds (same pattern as UAT); bound
 * via idpUserId.
 */
export const S1_CONSUMER_IDP_USER_ID = "c1a55e01-0001-4000-8000-000000000001";
export const S1_PRODUCER_A_IDP_USER_ID = "c1a55e01-0002-4000-8000-000000000002";
export const S1_PRODUCER_B_IDP_USER_ID = "c1a55e01-0003-4000-8000-000000000003";
export const S1_MANAGER_IDP_USER_ID = "c1a55e01-0004-4000-8000-000000000004";
export const S1_INVITED_IDP_USER_ID = "c1a55e01-0005-4000-8000-000000000005";

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

export function seedS1CommunitySettings(): CommunitySettings {
  return {
    communityId: S1_COMMUNITY_ID,
    currency: "EUR",
    billingPeriod: "monthly",
    threshold: "5.00",
    vatRate: "0.00",
    billingMode: "virtual",
  };
}

/**
 * V1 UAT registry (INT-194) — bind Keycloak fixture subjects so `/v1/me` works
 * after pod restart without a live manager import. Managers may still import
 * more participants (REQ-008). IdP sub UUIDs match `int-realm.json` user ids.
 */
export function seedUatParticipants(): ParticipantRecord[] {
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
        name: "Hugo Petit",
        address: "",
        email: "hugo.petit@example.invalid",
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
        name: "Sofia Garcia",
        address: "",
        email: "sofia.garcia@example.invalid",
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
        name: "Paul Nguyen",
        address: "",
        email: "paul.nguyen@example.invalid",
      },
      termsVersionAccepted: null,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
  ];
}

/**
 * INT-230 / INT-236 / INT-241 — S1 fixture parties (AC-15). Profile + terms +
 * self-billing are pre-accepted so AC-07 payment-account-status can advance
 * them to Ready (BR-09) without a member UI pass. paymentAccountReady stays
 * false until Connect / PM provision notifies AC-03. idpUserId matches
 * Keycloak S1 users so member/manager login → participantId → trades →
 * invoice is one chain. Manager enables Start run from the portal (REQ-006).
 */
export function seedS1Participants(): ParticipantRecord[] {
  const communityId = S1_COMMUNITY_ID;
  const readyProfile = (
    name: string,
    email: string,
  ): ParticipantRecord["profile"] => ({
    name,
    address: "1 Fixture Lane",
    email,
  });
  return [
    {
      participantId: S1_CONSUMER_ID,
      communityId,
      role: "consumer",
      status: "TermsAccepted",
      marketActorId: S1_CONSUMER_ID,
      meterId: "m-lea-martin",
      idpUserId: S1_CONSUMER_IDP_USER_ID,
      profile: readyProfile("Léa Martin", "lea.martin@example.invalid"),
      termsVersionAccepted: SEED_TERMS.termsVersion,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
    {
      participantId: S1_PRODUCER_A_ID,
      communityId,
      role: "producer",
      status: "TermsAccepted",
      marketActorId: S1_PRODUCER_A_ID,
      meterId: "m-thomas-bernard",
      idpUserId: S1_PRODUCER_A_IDP_USER_ID,
      profile: readyProfile("Thomas Bernard", "thomas.bernard@example.invalid"),
      termsVersionAccepted: SEED_TERMS.termsVersion,
      selfBillingMandate: true,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
    {
      participantId: S1_PRODUCER_B_ID,
      communityId,
      role: "producer",
      status: "TermsAccepted",
      marketActorId: S1_PRODUCER_B_ID,
      meterId: "m-claire-dubois",
      idpUserId: S1_PRODUCER_B_IDP_USER_ID,
      profile: readyProfile("Claire Dubois", "claire.dubois@example.invalid"),
      termsVersionAccepted: SEED_TERMS.termsVersion,
      selfBillingMandate: true,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
    {
      participantId: S1_MANAGER_ID,
      communityId,
      role: "prosumer",
      status: "TermsAccepted",
      marketActorId: "mkt-marie-leroy",
      meterId: "m-marie-leroy",
      idpUserId: S1_MANAGER_IDP_USER_ID,
      profile: readyProfile("Marie Leroy", "marie.leroy@example.invalid"),
      termsVersionAccepted: SEED_TERMS.termsVersion,
      selfBillingMandate: true,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
    // INT-285 — full Get-ready wizard on Horizon Energy; Léa stays TermsAccepted
    // for the money path (trades → invoices → Pay).
    {
      participantId: S1_INVITED_ID,
      communityId,
      role: "consumer",
      status: "Invited",
      marketActorId: "mkt-hugo-moreau",
      meterId: "m-hugo-moreau",
      idpUserId: S1_INVITED_IDP_USER_ID,
      profile: {
        name: "Hugo Moreau",
        address: "",
        email: "hugo.moreau@example.invalid",
      },
      termsVersionAccepted: null,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
    },
  ];
}

/** All seeded participants (UAT + S1). */
export function seedParticipants(): ParticipantRecord[] {
  return [...seedUatParticipants(), ...seedS1Participants()];
}
