import { Inject, Injectable, MiddlewareConsumer, Module, NestModule, OnModuleInit } from "@nestjs/common";
import { ModuleTemplateModule, OutboxService } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ParticipantsStore } from "./domain/store.js";
import { createIdpAdminPort } from "./idp/idp-admin.factory.js";
import { IDP_ADMIN_PORT } from "./idp/idp.port.js";
import { InternalParticipantsController } from "./participants/internal.controller.js";
import { PublicParticipantsController } from "./participants/public.controller.js";
import { ParticipantsService } from "./participants/participants.service.js";
import { createParticipantTransaction } from "./persistence/participant-journal.js";

/** INT-356 — load the registry at boot and commit changes with the outbox. */
@Injectable()
class ParticipantPersistence implements OnModuleInit {
  constructor(
    @Inject(ParticipantsStore) private readonly store: ParticipantsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { transaction, hydrate } = createParticipantTransaction(this.store, this.outbox);
    await hydrate();
    this.participants.useTransaction(transaction);
  }
}
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { ErasureRequestedListener } from "./events/erasure-requested.listener.js";
import { KycStatusChangedListener } from "./events/kyc-status-changed.listener.js";
import { ACTOR_SOURCE_PORT } from "./actors/actor-source.port.js";
import { createActorSource } from "./actors/actor-source.factory.js";
import { ActorSyncService } from "./actors/actor-sync.service.js";
import {
  createPspCapabilities,
  PSP_CAPABILITIES_PORT,
} from "./ports/psp-capabilities.port.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "participants" }),
  ],
  controllers: [InternalParticipantsController, PublicParticipantsController],
  providers: [
    ParticipantsStore,
    ParticipantsService,
    ParticipantPersistence,
    // INT-208 — Keycloak Admin when env present; mock otherwise / IDP_ADMIN_PROVIDER=mock
    { provide: IDP_ADMIN_PORT, useFactory: () => createIdpAdminPort() },
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    ErasureRequestedListener,
    // REQ-051 — mirror participant KYC into readiness (INT-431).
    KycStatusChangedListener,
    // REQ-008 — ActorSourcePort (mock|ewds|none); null when disabled.
    { provide: ACTOR_SOURCE_PORT, useFactory: () => createActorSource() },
    ActorSyncService,
    // REQ-043 / UAT-054 — live mode needs AC-07 liveConfigured.
    { provide: PSP_CAPABILITIES_PORT, useFactory: () => createPspCapabilities() },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
