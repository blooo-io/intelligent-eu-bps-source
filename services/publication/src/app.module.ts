import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { DATASPACE_PORT } from "./dataspace/dataspace.port.js";
import { MockDataspaceAdapter } from "./dataspace/mock-dataspace.adapter.js";
import { PublicationStore } from "./domain/store.js";
import { BillingEventsListener } from "./events/billing-events.listener.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { InternalPublicationController } from "./publication/internal.controller.js";
import { PublicationService } from "./publication/publication.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "publication" }),
  ],
  controllers: [InternalPublicationController],
  providers: [
    PublicationStore,
    PublicationService,
    { provide: DATASPACE_PORT, useClass: MockDataspaceAdapter },
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
