import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { RatesController } from "./rates/rates.controller.js";
import { RatesService } from "./rates/rates.service.js";
import { VatController } from "./vat/vat.controller.js";
import { VatService } from "./vat/vat.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "reference-data" }),
  ],
  controllers: [RatesController, VatController],
  providers: [RatesService, VatService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
