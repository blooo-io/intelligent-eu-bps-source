/** AC-11 — NotificationLog (02 §6 LB-09). Identifiers only in logs. */

export type NoticeTemplate = "payment-success" | "payment-failure";

export type NotificationLogEntry = {
  logId: string;
  eventId: string;
  paymentId: string;
  invoiceId: string;
  participantId: string;
  status: "succeeded" | "failed";
  template: NoticeTemplate;
  recordedAt: string;
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
