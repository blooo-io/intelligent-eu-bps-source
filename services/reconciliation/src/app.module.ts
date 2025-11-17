import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { ReconciliationStore } from "./domain/store.js";
import { InternalReconciliationController } from "./reconciliation/internal.controller.js";
import { PublicReconciliationController } from "./reconciliation/public.controller.js";
import { ReconciliationService } from "./reconciliation/reconciliation.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "reconciliation" }),
  ],
  controllers: [
    InternalReconciliationController,
    PublicReconciliationController,
  ],
  providers: [ReconciliationStore, ReconciliationService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
