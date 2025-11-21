import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  IdempotentConsumer,
  redactPersonalData,
} from "@intelligent/module-template";
import { NotificationStore } from "../domain/store.js";
import type { PaymentStatusEvent } from "../domain/types.js";
import { MAIL_PORT, type MailPort } from "../mail/mail.port.js";
import type { MailpitCatcherAdapter } from "../mail/mailpit-catcher.adapter.js";

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
    const to = this.store.getRecipient(event.participantId);
    if (!to) {
      throw new BadRequestException(
        `No recipient registered for participant ${event.participantId}`,
      );
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
