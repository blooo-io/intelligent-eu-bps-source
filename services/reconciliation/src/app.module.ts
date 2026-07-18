import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ReconciliationStore } from "./domain/store.js";
import { BillingEventsListener } from "./events/billing-events.listener.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { InternalReconciliationController } from "./reconciliation/internal.controller.js";
import { PublicReconciliationController } from "./reconciliation/public.controller.js";
import { ReconciliationService } from "./reconciliation/reconciliation.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "reconciliation" }),
  ],
  controllers: [
    InternalReconciliationController,
    PublicReconciliationController,
  ],
  providers: [
    ReconciliationStore,
    ReconciliationService,
    // INT-271 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    BillingEventsListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
