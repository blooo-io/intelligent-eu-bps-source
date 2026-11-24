import type {
  InvoiceSummary,
  ParticipantPersonalData,
  PaymentAccountPersonalData,
} from "../export/personal-data-sources.port.js";

/** Data-subject request kinds (public.v1 DataSubjectRequest). */
export type DataSubjectRequestType = "export" | "erasure";

/**
 * Workflow statuses for a DSR.
 * Erasure stays in propagating until AC-03/06/07 report ErasureCompleted.
 */
export type DataSubjectRequestStatus =
  | "accepted"
  | "propagating"
  | "completed"
  | "failed";

/** Modules that store personal data and must ack erasure (03 §4 ErasureCompleted). */
export type ErasureModule = "AC-03" | "AC-06" | "AC-07";

export const ERASURE_MODULES: readonly ErasureModule[] = [
  "AC-03",
  "AC-06",
  "AC-07",
];

export type DataSubjectRequest = {
  requestId: string;
  participantId: string;
  communityId: string;
  type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  createdAt: string;
  updatedAt: string;
  /** Actor who opened the request (identifier only). */
  actorId: string;
  /** Modules that completed erasure (REQ-013). */
  erasureResults: Partial<Record<ErasureModule, "completed" | "failed">>;
  /** IdP / Stripe-facing erasure dispatched (identifiers only). */
  identityErasureSent: boolean;
  paymentProviderErasureSent: boolean;
  /** PSP erase outcome when reported (REQ-013 / Task 3.21). */
  pspOutcome?: "erased" | "retained_by_psp" | "nothing_to_erase";
  /** Origin of the request — portal/API vs EWDS (Task 3.22). */
  origin?: "portal" | "ewds";
  /** External EWDS request id when origin is ewds (Task 3.22). */
  externalRequestId?: string;
  /** Export package or erasure confirmation (identifiers only). */
  confirmation?: DataSubjectConfirmation;
};

export type DataSubjectConfirmation = {
  kind: "export" | "erasure";
  requestId: string;
  participantId: string;
  /** Invoice ids kept under legal retention (REQ-013). */
  invoicesRetained: string[];
  producedAt: string;
};

/** Audit entry — REQ-030 / AuditableActionPerformed (identifiers only). */
export type AuditEvent = {
  auditId: string;
  eventId?: string;
  actorId: string;
  action: string;
  target: string;
  timestamp: string;
};

/**
 * Local personal-data cache row used by ApplyRetention (REQ-011 / UAT-011).
 * No names or emails — only identifiers and relationship flags.
 */
export type PersonalDataRecord = {
  participantId: string;
  communityId: string;
  /** Last active relationship end; retention clock starts here. */
  relationshipEndedAt: string;
  activeRelationship: boolean;
  /** Cleared / anonymized by retention or erasure. */
  anonymized: boolean;
  /** Linked invoice ids kept for legal retention (never purged). */
  invoiceIds: string[];
};

export type RetentionPolicy = {
  /** Days after relationship end before personal cache is anonymized. */
  personalRetentionDays: number;
  /**
   * Years of legal invoice retention (REQ-013).
   * `retainedUntil` is 31 Dec of (issue year + this value).
   */
  invoiceRetentionYears: number;
};

/**
 * REQ-013 Art. 15/20 — machine-readable DSAR export (Task 3.20).
 * Assembled on each GET; never stored in the compliance store.
 */
export type DataSubjectExport = {
  schemaVersion: "1.0";
  requestId: string;
  producedAt: string;
  controller: { communityId: string };
  participant: ParticipantPersonalData;
  paymentAccount: PaymentAccountPersonalData | null;
  invoices: Array<InvoiceSummary & { retainedUntil: string }>;
  dataSubjectRequests: Array<{
    requestId: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
  /** Public RetentionPolicy shape (invoice years only — OpenAPI). */
  retention: { invoiceRetentionYears: number };
};
