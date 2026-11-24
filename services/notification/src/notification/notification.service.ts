import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  IdempotentConsumer,
  redactPersonalData,
  suggestedCorrectiveAction,
} from "@intelligent/module-template";
import { NotificationStore } from "../domain/store.js";
import type {
  InvoiceIssuedEvent,
  InvoiceOverdueEvent,
  PaymentReminderRequestedEvent,
  PaymentStatusEvent,
} from "../domain/types.js";
import { MAIL_PORT, type MailPort } from "../mail/mail.port.js";
import type { MailpitCatcherAdapter } from "../mail/mailpit-catcher.adapter.js";
import {
  INVOICE_DOCUMENT_PORT,
  NullInvoiceDocument,
  type InvoiceDocumentPort,
} from "../ports/invoice-document.port.js";
import {
  MapRecipient,
  RECIPIENT_PORT,
  type RecipientPort,
} from "../ports/recipient.port.js";

/**
 * AC-11 notification — payment notices (INT-110, REQ-017), invoice PDF
 * e-mail on issue (INT-428, REQ-039 / UAT-050), and payment reminders /
 * missing-payment alerts (INT-428, REQ-061 / UAT-078).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly documents: InvoiceDocumentPort;

  constructor(
    @Inject(NotificationStore) private readonly store: NotificationStore,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Optional()
    @Inject(RECIPIENT_PORT)
    private readonly recipients: RecipientPort | null = null,
    @Optional()
    @Inject(INVOICE_DOCUMENT_PORT)
    documents: InvoiceDocumentPort | null = null,
  ) {
    this.documents = documents ?? new NullInvoiceDocument();
  }

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

  /** Test helper — MapRecipient community manager contact (REQ-061). */
  registerCommunityManager(communityId: string, email: string): void {
    if (this.recipients instanceof MapRecipient) {
      this.recipients.registerCommunityManager(communityId, email);
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

  /**
   * Consume InvoiceIssued — e-mail PDF to consumer + copy to producer (REQ-039 / UAT-050).
   * Missing document throws so JetStream redelivers. Idempotent on eventId.
   */
  async onInvoiceIssued(
    event: InvoiceIssuedEvent,
  ): Promise<{ status: string }> {
    const result = await this.consumer.handle(event.eventId, event, async (e) => {
      await this.dispatchInvoiceIssued(e);
    });
    if (result.status === "failed") {
      throw result.error;
    }
    return { status: result.status };
  }

  /**
   * Consume PaymentReminderRequested — e-mail PDF reminder to consumer (REQ-061 / UAT-078).
   * Missing document throws so JetStream redelivers. Idempotent on eventId.
   */
  async onPaymentReminderRequested(
    event: PaymentReminderRequestedEvent,
  ): Promise<{ status: string }> {
    const result = await this.consumer.handle(event.eventId, event, async (e) => {
      await this.dispatchPaymentReminder(e);
    });
    if (result.status === "failed") {
      throw result.error;
    }
    return { status: result.status };
  }

  /**
   * Consume InvoiceStatusChanged Overdue — missing-payment alert to manager (REQ-061 / UAT-078).
   * Falls back to OPERATOR_ALERT_TO, then skips. Idempotent on eventId.
   */
  async onInvoiceOverdue(
    event: InvoiceOverdueEvent,
  ): Promise<{ status: string }> {
    const result = await this.consumer.handle(event.eventId, event, async (e) => {
      await this.dispatchInvoiceOverdue(e);
    });
    if (result.status === "failed") {
      throw result.error;
    }
    return { status: result.status };
  }

  private async dispatchPaymentReminder(
    event: PaymentReminderRequestedEvent,
  ): Promise<void> {
    const doc = await this.documents.fetch(event.invoiceId);
    if (!doc) {
      throw new Error(
        `invoice document not yet readable for ${event.invoiceId}`,
      );
    }

    const to = await this.resolveRecipientEmail(event.recipientId);
    if (!to) {
      this.logger.warn(
        JSON.stringify(
          redactPersonalData({
            msg: "notification.skip_no_recipient",
            participantId: event.recipientId,
            invoiceId: event.invoiceId,
            role: "recipient",
          }),
        ),
      );
      return;
    }

    const template = "payment-reminder" as const;
    const subject = `Payment reminder ${event.reminderNumber} for invoice ${event.invoiceId}`;
    const body = [
      `outstanding=${event.outstanding} ${event.currency}`,
      `dueDate=${event.dueDate}`,
    ].join("\n");

    await this.mail.send({
      template,
      to,
      subject,
      body,
      attachments: [
        {
          filename: `${doc.legalNumber}.pdf`,
          contentType: "application/pdf",
          content: doc.content,
        },
      ],
    });

    this.store.appendLog({
      logId: randomUUID(),
      eventId: event.eventId,
      paymentId: null,
      invoiceId: event.invoiceId,
      participantId: event.recipientId,
      status: "reminder",
      template,
      recordedAt: new Date().toISOString(),
    });

    this.logger.log(
      JSON.stringify(
        redactPersonalData({
          msg: "notification.sent",
          template,
          invoiceId: event.invoiceId,
          participantId: event.recipientId,
          status: "reminder",
          reminderNumber: event.reminderNumber,
        }),
      ),
    );
  }

  private async dispatchInvoiceOverdue(
    event: InvoiceOverdueEvent,
  ): Promise<void> {
    const managerEmail = this.recipients
      ? await this.recipients.resolveCommunityManagerEmail(event.communityId)
      : null;
    const to =
      managerEmail?.trim() ||
      process.env.OPERATOR_ALERT_TO?.trim() ||
      null;
    if (!to) {
      this.logger.warn(
        JSON.stringify(
          redactPersonalData({
            msg: "notification.skip_no_manager_contact",
            communityId: event.communityId,
            invoiceId: event.invoiceId,
          }),
        ),
      );
      return;
    }

    const template = "missing-payment-alert" as const;
    const subject = `Missing payment: invoice ${event.invoiceId}`;
    const body = [
      `invoiceId=${event.invoiceId}`,
      `outstanding=${event.outstanding}`,
      event.dueDate ? `dueDate=${event.dueDate}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    await this.mail.send({ template, to, subject, body });

    this.store.appendLog({
      logId: randomUUID(),
      eventId: event.eventId,
      paymentId: null,
      invoiceId: event.invoiceId,
      participantId: event.communityId,
      status: "overdue",
      template,
      recordedAt: new Date().toISOString(),
    });

    this.logger.log(
      JSON.stringify(
        redactPersonalData({
          msg: "notification.sent",
          template,
          invoiceId: event.invoiceId,
          communityId: event.communityId,
          status: "overdue",
        }),
      ),
    );
  }

  private async dispatchInvoiceIssued(event: InvoiceIssuedEvent): Promise<void> {
    const doc = await this.documents.fetch(event.invoiceId);
    if (!doc) {
      // Document not yet readable (replica lag) — nak for redelivery.
      throw new Error(
        `invoice document not yet readable for ${event.invoiceId}`,
      );
    }

    const attachment = {
      filename: `${doc.legalNumber}.pdf`,
      contentType: "application/pdf" as const,
      content: doc.content,
    };
    const body = [
      `invoiceId=${event.invoiceId}`,
      `total=${event.total} ${event.currency}`,
      `dueDate=${event.dueDate}`,
    ].join("\n");
    const template = "invoice-issued" as const;

    const parties: Array<{
      participantId: string;
      subject: string;
      role: "recipient" | "issuer";
    }> = [
      {
        participantId: event.recipientId,
        subject: `Invoice ${doc.legalNumber}`,
        role: "recipient",
      },
      {
        participantId: event.issuerId,
        subject: `Copy of self-billed invoice ${doc.legalNumber} issued in your name`,
        role: "issuer",
      },
    ];

    for (const party of parties) {
      const to = await this.resolveRecipientEmail(party.participantId);
      if (!to) {
        this.logger.warn(
          JSON.stringify(
            redactPersonalData({
              msg: "notification.skip_no_recipient",
              participantId: party.participantId,
              invoiceId: event.invoiceId,
              role: party.role,
            }),
          ),
        );
        continue;
      }

      await this.mail.send({
        template,
        to,
        subject: party.subject,
        body,
        attachments: [attachment],
      });

      this.store.appendLog({
        logId: randomUUID(),
        eventId: event.eventId,
        paymentId: null,
        invoiceId: event.invoiceId,
        participantId: party.participantId,
        status: "issued",
        template,
        recordedAt: new Date().toISOString(),
      });

      // NFR-015 — structured log carries identifiers only (no e-mail / @).
      this.logger.log(
        JSON.stringify(
          redactPersonalData({
            msg: "notification.sent",
            template,
            invoiceId: event.invoiceId,
            participantId: party.participantId,
            status: "issued",
            legalNumber: doc.legalNumber,
          }),
        ),
      );
    }
  }

  private async resolveRecipientEmail(
    participantId: string,
  ): Promise<string | null> {
    return (
      (this.recipients
        ? await this.recipients.resolveEmail(participantId)
        : null) ?? this.store.getRecipient(participantId) ?? null
    );
  }

  private async dispatch(event: PaymentStatusEvent): Promise<void> {
    if (event.status !== "succeeded" && event.status !== "failed") {
      return;
    }
    // INT-274 — AC-03 profile when wired; local map / store for tests.
    const to = await this.resolveRecipientEmail(event.participantId);
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
      // REQ-046 / UAT-057 — KPI UE-3 corrective action in failure notices.
      event.status === "failed"
        ? `correctiveAction=${suggestedCorrectiveAction(event.failureCategory)}`
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
