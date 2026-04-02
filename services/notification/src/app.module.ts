import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { NotificationStore } from "./domain/store.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { InMemoryEventBus } from "./events/in-memory-event-bus.js";
import { PaymentStatusListener } from "./events/payment-status.listener.js";
import { MAIL_PORT } from "./mail/mail.port.js";
import { MailpitCatcherAdapter } from "./mail/mailpit-catcher.adapter.js";
import { NotificationService } from "./notification/notification.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "notification" }),
  ],
  providers: [
    NotificationStore,
    NotificationService,
    MailpitCatcherAdapter,
    { provide: MAIL_PORT, useExisting: MailpitCatcherAdapter },
    // INT-209 — in-process bus until NATS consumer is wired after outbox CDC
    InMemoryEventBus,
    { provide: EVENT_BUS_PORT, useExisting: InMemoryEventBus },
    PaymentStatusListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
