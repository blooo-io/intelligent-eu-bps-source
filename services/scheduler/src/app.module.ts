import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { SchedulerStore } from "./domain/store.js";
import { createDispatchPort } from "./dispatch/dispatch.factory.js";
import { DISPATCH_PORT } from "./dispatch/dispatch.port.js";
import { PublicSchedulerController } from "./scheduler/public.controller.js";
import { SchedulerService } from "./scheduler/scheduler.service.js";

@Module({
  imports: [ModuleTemplateModule.forRoot({ moduleName: "scheduler" })],
  controllers: [PublicSchedulerController],
  providers: [
    SchedulerStore,
    SchedulerService,
    // INT-210 — Temporal when TEMPORAL_ADDRESS set; mock otherwise / DISPATCH_PROVIDER=mock
    { provide: DISPATCH_PORT, useFactory: () => createDispatchPort() },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
