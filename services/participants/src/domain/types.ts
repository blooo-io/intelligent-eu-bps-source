/** Domain types for AC-03 / LB-02 (02 §5 readiness, 03 §2). */

export type ParticipantRole = "consumer" | "producer" | "prosumer";
export type BillingMode = "live" | "virtual";
export type ReadinessStatus =
  | "Invited"
  | "ProfileCompleted"
  | "TermsAccepted"
  | "Ready"
  | "Restricted"
  | "Offboarded";

export type BillingProfile = {
  name: string;
  address: string;
  email: string;
};

export type CommunitySettings = {
  communityId: string;
  currency: string;
  billingPeriod: string;
  threshold: string;
  vatRate: string;
  billingMode: BillingMode;
};

export type ParticipantRecord = {
  participantId: string;
  communityId: string;
  role: ParticipantRole;
  status: ReadinessStatus;
  marketActorId: string;
  meterId: string;
  /** IdP subject created by P-IDP (identifiers only in logs/events). */
  idpUserId: string | null;
  profile: BillingProfile | null;
  termsVersionAccepted: string | null;
  selfBillingMandate: boolean;
  /** Set from PaymentAccountStatusChanged (AC-07) — KYC / payment method. */
  paymentAccountReady: boolean;
  paymentBlockReason: string | null;
};

export type TermsDocument = {
  termsVersion: string;
  text: string;
};

export type ParticipantImportRow = {
  email: string;
  marketActorId: string;
  meterId: string;
  role: ParticipantRole;
};

export type ParticipantPatch = {
  marketActorId?: string;
  meterId?: string;
  role?: ParticipantRole;
};
