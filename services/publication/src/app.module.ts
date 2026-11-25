import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import {
  ModuleTemplateModule,
  OutboxService,
} from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { createCommandPoller, CommandPoller } from "./commands/command-poller.js";
import {
  DATASPACE_PORT,
  createDataspacePort,
} from "./dataspace/dataspace.factory.js";
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
    // A8 / Task 4.11 — DATASPACE_ADAPTER selects mock vs EWDS CG publish.
    {
      provide: DATASPACE_PORT,
      useFactory: () => createDataspacePort(process.env),
    },
    // INT-271 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    BillingEventsListener,
    // REQ-052 / A7 — command channel poller (no-op unless COMMAND_CHANNEL_ENABLED=true).
    {
      provide: CommandPoller,
      useFactory: (outbox: OutboxService) =>
        createCommandPoller(process.env, { outbox }),
      inject: [OutboxService],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
