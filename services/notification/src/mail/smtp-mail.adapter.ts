import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type { CapturedMail } from "../domain/types.js";
import { toCapturedAttachments } from "./attachment-meta.js";
import { MailpitCatcherAdapter } from "./mailpit-catcher.adapter.js";
import type { MailPort, SendMailInput } from "./mail.port.js";

export type TransportFactory = (url: string) => Transporter;

/**
 * P-MAIL SMTP adapter (TD-12) — nodemailer against Mailpit / transactional SMTP.
 * Records captured metadata (including attachment digests) so `captured()` works in UAT.
 * Licence: nodemailer is MIT-0 (permissive MIT without attribution).
 */
export class SmtpMailAdapter implements MailPort {
  private readonly inbox: CapturedMail[] = [];
  private readonly transport: Transporter;

  constructor(
    url: string,
    transportFactory: TransportFactory = (u) => nodemailer.createTransport(u),
  ) {
    this.transport = transportFactory(url);
  }

  async send(input: SendMailInput): Promise<{ messageId: string }> {
    const info = await this.transport.sendMail({
      to: input.to,
      subject: input.subject,
      text: input.body,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content,
      })),
    });
    const messageId =
      typeof info.messageId === "string" && info.messageId.length > 0
        ? info.messageId
        : randomUUID();
    this.inbox.push({
      messageId,
      template: input.template,
      to: input.to,
      subject: input.subject,
      body: input.body,
      capturedAt: new Date().toISOString(),
      attachments: toCapturedAttachments(input.attachments),
    });
    return { messageId };
  }

  captured(): readonly CapturedMail[] {
    return this.inbox.map((m) => structuredClone(m));
  }

  reset(): void {
    this.inbox.length = 0;
  }
}

/** SMTP_URL set → SMTP; otherwise in-memory catcher (CI / unit tests). */
export function createMailPort(env: NodeJS.ProcessEnv = process.env): MailPort {
  const url = env.SMTP_URL?.trim();
  if (url) {
    return new SmtpMailAdapter(url);
  }
  return new MailpitCatcherAdapter();
}
