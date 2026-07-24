import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { NotificationStore } from "./domain/store.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { OperatorAlertsListener } from "./events/operator-alerts.listener.js";
import { PaymentStatusListener } from "./events/payment-status.listener.js";
import { MAIL_PORT } from "./mail/mail.port.js";
import { MailpitCatcherAdapter } from "./mail/mailpit-catcher.adapter.js";
import { NotificationService } from "./notification/notification.service.js";
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
    MailpitCatcherAdapter,
    { provide: MAIL_PORT, useExisting: MailpitCatcherAdapter },
    // INT-217 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    // INT-274 — AC-03 profile e-mail when PARTICIPANTS_INTERNAL_URL is set.
    { provide: RECIPIENT_PORT, useFactory: () => createRecipient() },
    PaymentStatusListener,
    OperatorAlertsListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
