import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CapturedMail } from "../domain/types.js";
import type { MailPort, SendMailInput } from "./mail.port.js";

/**
 * V1 P-MAIL adapter — in-memory Mailpit catcher (TD-12).
 * Cluster deploy uses real Mailpit SMTP; tests assert against `captured()`.
 */
@Injectable()
export class MailpitCatcherAdapter implements MailPort {
  private readonly inbox: CapturedMail[] = [];

  async send(input: SendMailInput): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    this.inbox.push({
      messageId,
      template: input.template,
      to: input.to,
      subject: input.subject,
      body: input.body,
      capturedAt: new Date().toISOString(),
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
