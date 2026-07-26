import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ParticipantsStore } from "./domain/store.js";
import { createIdpAdminPort } from "./idp/idp-admin.factory.js";
import { IDP_ADMIN_PORT } from "./idp/idp.port.js";
import { InternalParticipantsController } from "./participants/internal.controller.js";
import { PublicParticipantsController } from "./participants/public.controller.js";
import { ParticipantsService } from "./participants/participants.service.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { ErasureRequestedListener } from "./events/erasure-requested.listener.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "participants" }),
  ],
  controllers: [InternalParticipantsController, PublicParticipantsController],
  providers: [
    ParticipantsStore,
    ParticipantsService,
    // INT-208 — Keycloak Admin when env present; mock otherwise / IDP_ADMIN_PROVIDER=mock
    { provide: IDP_ADMIN_PORT, useFactory: () => createIdpAdminPort() },
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    ErasureRequestedListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
