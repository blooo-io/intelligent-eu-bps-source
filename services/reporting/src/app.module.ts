import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ReportingStore } from "./domain/store.js";
import { InternalReportingController } from "./reporting/internal.controller.js";
import { PublicReportingController } from "./reporting/public.controller.js";
import { ReportingService } from "./reporting/reporting.service.js";

@Module({
  imports: [ModuleTemplateModule.forRoot({ moduleName: "reporting" })],
  controllers: [PublicReportingController, InternalReportingController],
  providers: [ReportingStore, ReportingService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
