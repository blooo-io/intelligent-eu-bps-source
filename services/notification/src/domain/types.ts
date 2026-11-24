/** AC-11 — NotificationLog (02 §6 LB-09). Identifiers only in logs. */

export type NoticeTemplate =
  | "payment-success"
  | "payment-failure"
  | "operator-alert"
  | "invoice-issued"
  | "payment-reminder"
  | "missing-payment-alert";

export type NotificationLogEntry = {
  logId: string;
  eventId: string;
  /** Null for invoice notices that are not payment-driven (REQ-039). */
  paymentId: string | null;
  invoiceId: string;
  participantId: string;
  status: "succeeded" | "failed" | "issued" | "reminder" | "overdue";
  template: NoticeTemplate;
  recordedAt: string;
};

/** InvoiceIssued payload fields used by AC-11 (REQ-039 / UAT-050). */
export type InvoiceIssuedEvent = {
  eventId: string;
  invoiceId: string;
  issuerId: string;
  recipientId: string;
  communityId: string;
  dueDate: string;
  total: string;
  currency: string;
};

/** PaymentReminderRequested — consumer reminder with PDF (REQ-061 / UAT-078). */
export type PaymentReminderRequestedEvent = {
  eventId: string;
  invoiceId: string;
  recipientId: string;
  communityId: string;
  dueDate: string;
  outstanding: string;
  currency: string;
  reminderNumber: number;
};

/** InvoiceStatusChanged Overdue — missing-payment alert (REQ-061 / UAT-078). */
export type InvoiceOverdueEvent = {
  eventId: string;
  invoiceId: string;
  communityId: string;
  outstanding: string;
  dueDate?: string;
};

/** Captured attachment metadata only — never raw bytes (UAT-050). */
export type CapturedMailAttachment = {
  filename: string;
  contentType: string;
  byteLength: number;
  sha256: string;
};

export type CapturedMail = {
  messageId: string;
  template: NoticeTemplate;
  /** Delivery address — never written to NotificationLog. */
  to: string;
  subject: string;
  /** Body may reference identifiers only. */
  body: string;
  capturedAt: string;
  attachments?: CapturedMailAttachment[];
};

export type PaymentStatusEvent = {
  eventId: string;
  paymentId: string;
  invoiceId: string;
  status: string;
  failureCategory?: string;
  /** Payer participant id — from consumer context / projection. */
  participantId: string;
  communityId: string;
};
