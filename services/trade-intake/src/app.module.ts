import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { createMockSuite } from "@intelligent/mocks";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { TradeStore } from "./domain/store.js";
import { IntakeController } from "./intake/intake.controller.js";
import { IntakeService } from "./intake/intake.service.js";
import { PublicIntakeController } from "./intake/public.controller.js";
import { FixturePartyResolver } from "./party/fixture-party-resolver.js";
import { PARTY_RESOLVER } from "./party/party-resolver.port.js";

const s1 = createMockSuite("S1");
const knownActors = new Set(
  s1.scenario.trades.flatMap((t) => [t.buyerActorId, t.sellerActorId]),
);

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "trade-intake" }),
  ],
  controllers: [IntakeController, PublicIntakeController],
  providers: [
    TradeStore,
    IntakeService,
    {
      provide: PARTY_RESOLVER,
      useValue: new FixturePartyResolver(s1.scenario.communityId, knownActors),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
