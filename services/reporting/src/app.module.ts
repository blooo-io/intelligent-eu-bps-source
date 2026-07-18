import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ReportingStore } from "./domain/store.js";
import { BillingEventsListener } from "./events/billing-events.listener.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { InternalReportingController } from "./reporting/internal.controller.js";
import { PublicReportingController } from "./reporting/public.controller.js";
import { ReportingService } from "./reporting/reporting.service.js";

@Module({
  imports: [ModuleTemplateModule.forRoot({ moduleName: "reporting" })],
  controllers: [PublicReportingController, InternalReportingController],
  providers: [
    ReportingStore,
    ReportingService,
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
