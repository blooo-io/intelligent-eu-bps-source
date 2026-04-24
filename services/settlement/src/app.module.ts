import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { SettlementStore } from "./domain/store.js";
import { createBilledTradesStore } from "./ports/billed-trades.store.js";
import { FixtureTradeSource } from "./ports/fixture-trade-source.js";
import { TRADE_SOURCE } from "./ports/trade-source.port.js";
import { SettlementController } from "./settlement/settlement.controller.js";
import { PublicSettlementController } from "./settlement/public.controller.js";
import { SettlementService } from "./settlement/settlement.service.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "settlement" }),
  ],
  controllers: [SettlementController, PublicSettlementController],
  providers: [
    SettlementStore,
    SettlementService,
    {
      // INT-225 — hydrate billed trade ids from Postgres when DATABASE_URL is set.
      provide: TRADE_SOURCE,
      useFactory: async () => {
        const source = new FixtureTradeSource("S1", createBilledTradesStore());
        await source.hydrate();
        return source;
      },
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
