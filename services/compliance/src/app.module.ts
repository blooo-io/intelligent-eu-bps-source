import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ComplianceStore } from "./domain/store.js";
import { readRetentionPolicy } from "./domain/retention-config.js";
import { IDP_PORT } from "./idp/idp.port.js";
import { PSP_ERASE_PORT } from "./psp/psp-erase.port.js";
import {
  createEraseAdapters,
  ERASE_ADAPTERS,
  type EraseAdapters,
} from "./erasure/erase-adapters.factory.js";
import {
  createErasureRequestPort,
  ERASURE_REQUEST_PORT,
} from "./erasure/erasure-request.port.js";
import { ErasureRequestListener } from "./erasure/erasure-request.listener.js";
import { ComplianceService } from "./compliance/compliance.service.js";
import {
  createParticipantCommunity,
  PARTICIPANT_COMMUNITY,
} from "./ports/participant-community.port.js";
import {
  createPersonalDataSources,
  PERSONAL_DATA_SOURCES,
} from "./export/personal-data-sources.port.js";
import { InternalComplianceController } from "./compliance/internal.controller.js";
import { PublicComplianceController } from "./compliance/public.controller.js";

@Module({
  imports: [ModuleTemplateModule.forRoot({ moduleName: "compliance" })],
  controllers: [PublicComplianceController, InternalComplianceController],
  providers: [
    {
      provide: ComplianceStore,
      useFactory: () => new ComplianceStore(readRetentionPolicy()),
    },
    ComplianceService,
    ErasureRequestListener,
    {
      provide: ERASE_ADAPTERS,
      useFactory: () => createEraseAdapters(),
    },
    {
      provide: IDP_PORT,
      useFactory: (adapters: EraseAdapters) => adapters.idp,
      inject: [ERASE_ADAPTERS],
    },
    {
      provide: PSP_ERASE_PORT,
      useFactory: (adapters: EraseAdapters) => adapters.psp,
      inject: [ERASE_ADAPTERS],
    },
    {
      provide: ERASURE_REQUEST_PORT,
      useFactory: () => createErasureRequestPort(),
    },
    {
      provide: PARTICIPANT_COMMUNITY,
      useFactory: () => createParticipantCommunity(),
    },
    {
      provide: PERSONAL_DATA_SOURCES,
      useFactory: () => createPersonalDataSources(),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
