import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  IdempotentConsumer,
  redactPersonalData,
} from "@intelligent/module-template";
import { NotificationStore } from "../domain/store.js";
import type { PaymentStatusEvent } from "../domain/types.js";
import { MAIL_PORT, type MailPort } from "../mail/mail.port.js";
import type { MailpitCatcherAdapter } from "../mail/mailpit-catcher.adapter.js";
import {
  MapRecipient,
  RECIPIENT_PORT,
  type RecipientPort,
} from "../ports/recipient.port.js";

/**
 * AC-11 notification — payment success/failure notices (INT-110, REQ-017).
 * Invoice PDF e-mail is out of scope (Stripe / TD-2).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NotificationStore) private readonly store: NotificationStore,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Optional()
    @Inject(RECIPIENT_PORT)
    private readonly recipients: RecipientPort | null = null,
  ) {}

  resetStore(): void {
    this.store.reset();
    const catcher = this.mail as MailpitCatcherAdapter;
    if (typeof catcher.reset === "function") {
      catcher.reset();
    }
  }

  registerRecipient(participantId: string, email: string): void {
    this.store.registerRecipient(participantId, email);
    if (this.recipients instanceof MapRecipient) {
      this.recipients.register(participantId, email);
    }
  }

  listLogs() {
    return this.store.listLogs();
  }

  capturedMail() {
    return this.mail.captured();
  }

  /**
   * Consume PaymentStatusChanged (REQ-017 / UAT-017).
   * Idempotent on eventId. Only succeeded | failed trigger notices.
   */
  async onPaymentStatusChanged(
    event: PaymentStatusEvent,
  ): Promise<{ status: string }> {
    const result = await this.consumer.handle(event.eventId, event, async (e) => {
      await this.dispatch(e);
    });
    if (result.status === "failed") {
      throw result.error;
    }
    return { status: result.status };
  }

  private async dispatch(event: PaymentStatusEvent): Promise<void> {
    if (event.status !== "succeeded" && event.status !== "failed") {
      return;
    }
    // INT-274 — AC-03 profile when wired; local map / store for tests.
    let to =
      (this.recipients
        ? await this.recipients.resolveEmail(event.participantId)
        : null) ?? this.store.getRecipient(event.participantId) ?? null;
    if (!to) {
      // Fail soft on cluster — do not nak forever when profile e-mail is missing.
      this.logger.warn(
        JSON.stringify(
          redactPersonalData({
            msg: "notification.skip_no_recipient",
            participantId: event.participantId,
            paymentId: event.paymentId,
          }),
        ),
      );
      return;
    }

    const template =
      event.status === "succeeded" ? "payment-success" : "payment-failure";
    const subject =
      event.status === "succeeded"
        ? `Payment succeeded (${event.paymentId})`
        : `Payment failed (${event.paymentId})`;
    const body = [
      `paymentId=${event.paymentId}`,
      `invoiceId=${event.invoiceId}`,
      `status=${event.status}`,
      event.failureCategory
        ? `failureCategory=${event.failureCategory}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    await this.mail.send({ template, to, subject, body });

    this.store.appendLog({
      logId: randomUUID(),
      eventId: event.eventId,
      paymentId: event.paymentId,
      invoiceId: event.invoiceId,
      participantId: event.participantId,
      status: event.status,
      template,
      recordedAt: new Date().toISOString(),
    });

    // NFR-015 — structured log carries identifiers only.
    this.logger.log(
      JSON.stringify(
        redactPersonalData({
          msg: "notification.sent",
          template,
          paymentId: event.paymentId,
          invoiceId: event.invoiceId,
          participantId: event.participantId,
          status: event.status,
        }),
      ),
    );
  }
}
