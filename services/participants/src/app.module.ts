import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ParticipantsStore } from "./domain/store.js";
import { IDP_ADMIN_PORT } from "./idp/idp.port.js";
import { MockIdpAdapter } from "./idp/mock-idp.adapter.js";
import { InternalParticipantsController } from "./participants/internal.controller.js";
import { PublicParticipantsController } from "./participants/public.controller.js";
import { ParticipantsService } from "./participants/participants.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "participants" }),
  ],
  controllers: [InternalParticipantsController, PublicParticipantsController],
  providers: [
    ParticipantsStore,
    ParticipantsService,
    { provide: IDP_ADMIN_PORT, useClass: MockIdpAdapter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
