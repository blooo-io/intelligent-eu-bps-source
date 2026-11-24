import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { NotificationStore } from "./domain/store.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { InvoiceNoticesListener } from "./events/invoice-notices.listener.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { OperatorAlertsListener } from "./events/operator-alerts.listener.js";
import { PaymentStatusListener } from "./events/payment-status.listener.js";
import { MAIL_PORT } from "./mail/mail.port.js";
import { createMailPort } from "./mail/smtp-mail.adapter.js";
import { NotificationService } from "./notification/notification.service.js";
import {
  createInvoiceDocument,
  INVOICE_DOCUMENT_PORT,
} from "./ports/invoice-document.port.js";
import {
  createRecipient,
  RECIPIENT_PORT,
} from "./ports/recipient.port.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "notification" }),
  ],
  providers: [
    NotificationStore,
    NotificationService,
    // INT-428 — SMTP when SMTP_URL set; Mailpit catcher otherwise (CI).
    { provide: MAIL_PORT, useFactory: () => createMailPort() },
    // INT-217 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    // INT-274 — AC-03 profile e-mail when PARTICIPANTS_INTERNAL_URL is set.
    { provide: RECIPIENT_PORT, useFactory: () => createRecipient() },
    // INT-428 — AC-06 invoice PDF when INVOICING_INTERNAL_URL is set.
    {
      provide: INVOICE_DOCUMENT_PORT,
      useFactory: () => createInvoiceDocument(),
    },
    PaymentStatusListener,
    OperatorAlertsListener,
    InvoiceNoticesListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
