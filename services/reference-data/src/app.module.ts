import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { RatesController } from "./rates/rates.controller.js";
import { RatesService } from "./rates/rates.service.js";
import { createTariffPort } from "./tariff/tariff.factory.js";
import { TARIFF_PORT } from "./tariff/tariff.port.js";
import { VatController } from "./vat/vat.controller.js";
import { VatService } from "./vat/vat.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "reference-data" }),
  ],
  controllers: [RatesController, VatController],
  providers: [
    RatesService,
    VatService,
    // REQ-004 / INT-432 — P-TARIFF (mock default; ewds via TARIFF_ADAPTER).
    { provide: TARIFF_PORT, useFactory: () => createTariffPort() },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
