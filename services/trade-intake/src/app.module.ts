import {
  Inject,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
} from "@nestjs/common";
import { createMockSuite } from "@intelligent/mocks";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { TradeStore } from "./domain/store.js";
import { IntakeController } from "./intake/intake.controller.js";
import { IntakeService } from "./intake/intake.service.js";
import { PublicIntakeController } from "./intake/public.controller.js";
import { FixturePartyResolver } from "./party/fixture-party-resolver.js";
import { HttpPartyResolver } from "./party/http-party-resolver.js";
import {
  PARTY_RESOLVER,
  type PartyResolverPort,
} from "./party/party-resolver.port.js";

const s1 = createMockSuite("S1");
const knownActors = new Set(
  s1.scenario.trades.flatMap((t) => [t.buyerActorId, t.sellerActorId]),
);

/** INT-237 — HttpPartyResolver when PARTICIPANTS_INTERNAL_URL is set. */
function createPartyResolver(
  env: NodeJS.ProcessEnv = process.env,
): PartyResolverPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpPartyResolver(base);
  }
  return new FixturePartyResolver(s1.scenario.communityId, knownActors);
}

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
      useFactory: () => createPartyResolver(),
    },
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }

  async onModuleInit(): Promise<void> {
    // INT-232 — populate S1 unbilled trades so AC-05 HttpTradeSource has data
    // before the first scheduler RefreshIntake (cluster default).
    const flag = (
      process.env.INTAKE_BOOTSTRAP_S1 ??
      process.env.intake_bootstrap_s1 ??
      "true"
    ).toLowerCase();
    if (flag === "0" || flag === "false" || flag === "no") {
      return;
    }
    try {
      const result = await this.intake.bootstrapS1Window();
      // console — NestFactory logger is error/warn only in main.ts.
      console.log(
        JSON.stringify({
          msg: "INTAKE_BOOTSTRAP_S1",
          ingested: result.ingested,
        }),
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          msg: "INTAKE_BOOTSTRAP_S1_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      this.logger.warn(
        `INTAKE_BOOTSTRAP_S1 failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
