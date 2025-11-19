import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { DATASPACE_PORT } from "./dataspace/dataspace.port.js";
import { MockDataspaceAdapter } from "./dataspace/mock-dataspace.adapter.js";
import { PublicationStore } from "./domain/store.js";
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
