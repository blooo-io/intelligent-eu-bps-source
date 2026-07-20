import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { SettlementStore } from "./domain/store.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { ParticipantOffboardedListener } from "./events/participant-offboarded.listener.js";
import { createBilledTradesStore } from "./ports/billed-trades.store.js";
import {
  COMMUNITY_SETTINGS_PORT,
  createCommunitySettings,
} from "./ports/community-settings.port.js";
import { FixtureTradeSource } from "./ports/fixture-trade-source.js";
import { HttpTradeSource } from "./ports/http-trade-source.js";
import {
  createReferenceData,
  REFERENCE_DATA_PORT,
} from "./ports/reference-data.port.js";
import { TRADE_SOURCE, type TradeSourcePort } from "./ports/trade-source.port.js";
import { SettlementController } from "./settlement/settlement.controller.js";
import { PublicSettlementController } from "./settlement/public.controller.js";
import { SettlementService } from "./settlement/settlement.service.js";

function createTradeSource(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TradeSourcePort> | TradeSourcePort {
  const base = env.TRADE_INTAKE_INTERNAL_URL;
  if (base) {
    // INT-232 — live AC-04 GetUnbilledTrades + mark-billed.
    return new HttpTradeSource(base);
  }
  // INT-225 — hydrate billed trade ids from Postgres when DATABASE_URL is set.
  const source = new FixtureTradeSource("S1", createBilledTradesStore());
  return source.hydrate().then(() => source);
}

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "settlement" }),
  ],
  controllers: [SettlementController, PublicSettlementController],
  providers: [
    SettlementStore,
    SettlementService,
    {
      provide: TRADE_SOURCE,
      useFactory: () => createTradeSource(),
    },
    // INT-272 — AC-03 settings + AC-13 VAT/FX when URLs are set (cluster).
    {
      provide: COMMUNITY_SETTINGS_PORT,
      useFactory: () => createCommunitySettings(),
    },
    {
      provide: REFERENCE_DATA_PORT,
      useFactory: () => createReferenceData(),
    },
    // INT-273 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    ParticipantOffboardedListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
