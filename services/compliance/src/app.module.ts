import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ComplianceStore } from "./domain/store.js";
import { IDP_PORT } from "./idp/idp.port.js";
import { MockIdpAdapter } from "./idp/mock-idp.adapter.js";
import { PSP_ERASE_PORT } from "./psp/psp-erase.port.js";
import { MockPspEraseAdapter } from "./psp/mock-psp-erase.adapter.js";
import { ComplianceService } from "./compliance/compliance.service.js";
import {
  createParticipantCommunity,
  PARTICIPANT_COMMUNITY,
} from "./ports/participant-community.port.js";
import { InternalComplianceController } from "./compliance/internal.controller.js";
import { PublicComplianceController } from "./compliance/public.controller.js";

@Module({
  imports: [ModuleTemplateModule.forRoot({ moduleName: "compliance" })],
  controllers: [PublicComplianceController, InternalComplianceController],
  providers: [
    ComplianceStore,
    ComplianceService,
    MockIdpAdapter,
    MockPspEraseAdapter,
    { provide: IDP_PORT, useExisting: MockIdpAdapter },
    { provide: PSP_ERASE_PORT, useExisting: MockPspEraseAdapter },
    {
      provide: PARTICIPANT_COMMUNITY,
      useFactory: () => createParticipantCommunity(),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
