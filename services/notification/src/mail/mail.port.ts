import type { CapturedMail, NoticeTemplate } from "../domain/types.js";

export const MAIL_PORT = Symbol("MAIL_PORT");

export type SendMailInput = {
  template: NoticeTemplate;
  to: string;
  subject: string;
  body: string;
};

/** P-MAIL — send(template, to, attachments) (03 §7). */
export interface MailPort {
  send(input: SendMailInput): Promise<{ messageId: string }>;
  /** Mailpit / catcher inspection for UAT. */
  captured(): readonly CapturedMail[];
}
