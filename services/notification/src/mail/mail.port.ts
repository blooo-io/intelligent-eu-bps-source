import type { CapturedMail, NoticeTemplate } from "../domain/types.js";

export const MAIL_PORT = Symbol("MAIL_PORT");

/** PDF attachment for invoice notices (REQ-039 / UAT-050). */
export type MailAttachment = {
  filename: string;
  contentType: "application/pdf";
  content: Buffer;
};

export type SendMailInput = {
  template: NoticeTemplate;
  to: string;
  subject: string;
  body: string;
  attachments?: MailAttachment[];
};

/** P-MAIL — send(template, to, attachments) (03 §7). */
export interface MailPort {
  send(input: SendMailInput): Promise<{ messageId: string }>;
  /** Mailpit / catcher inspection for UAT. */
  captured(): readonly CapturedMail[];
}
