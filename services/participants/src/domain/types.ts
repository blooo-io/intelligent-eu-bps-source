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

/** Structured postal address for DSAR export (REQ-013 / Task 3.11+3.18). */
export type PostalAddress = {
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

export type CommunitySettings = {
  communityId: string;
  currency: string;
  billingPeriod: string;
  threshold: string;
  vatRate: string;
  billingMode: BillingMode;
  /** REQ-015 — AC-07 pays out producers automatically when true. */
  autoPayout: boolean;
};

/** PUT body: `autoPayout` is optional and defaults to false (REQ-015). */
export type CommunitySettingsWrite = Omit<CommunitySettings, "communityId" | "autoPayout"> & {
  autoPayout?: boolean;
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
  /**
   * REQ-013 / Task 3.18 — provenance for DSAR. Defaults to `"import"` when
   * unset (CSV / UAT seed). EWDS Actor intake (Task 3.11) sets `"ewds"`.
   */
  source?: "ewds" | "import";
  /** Structured address when known (EWDS); otherwise null. */
  postalAddress?: PostalAddress | null;
  phone?: string | null;
  /** ISO timestamp of the member's T&C acceptance when recorded. */
  termsAcceptedAt?: string | null;
  /** Mirror of AC-07 KYC verified flag when notified. */
  kycVerified?: boolean;
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
  /**
   * Optional IdP subject already provisioned (e.g. Keycloak user).
   * When set, skip IdP createUser / invitation (INT-180).
   */
  existingIdpSubject?: string;
};

export type ParticipantPatch = {
  marketActorId?: string;
  meterId?: string;
  role?: ParticipantRole;
};
