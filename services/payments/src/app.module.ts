import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { PaymentsStore } from "./domain/store.js";
import { PaymentsController } from "./payments/payments.controller.js";
import { PaymentsService } from "./payments/payments.service.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";
import { PSP_PORT } from "./psp/psp.port.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "payments" }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsStore,
    PaymentsService,
    { provide: PSP_PORT, useClass: MockPspAdapter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
