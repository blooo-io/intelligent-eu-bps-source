import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { InvoiceStore } from "./domain/store.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { SettlementCompletedListener } from "./events/settlement-completed.listener.js";
import { InvoicingController } from "./invoicing/invoicing.controller.js";
import { PublicInvoicingController } from "./invoicing/public.controller.js";
import { InvoicingService } from "./invoicing/invoicing.service.js";
import {
  AlwaysReadyReadiness,
  READINESS_PORT,
} from "./ports/readiness.port.js";
import {
  createSettlementClient,
  SETTLEMENT_CLIENT,
} from "./ports/settlement-client.port.js";
import { MockStripeInvoiceAdapter } from "./stripe/mock-stripe-invoice.js";
import { STRIPE_INVOICE_PORT } from "./stripe/stripe-invoice.port.js";
import { StripeInvoiceAdapter } from "./stripe/stripe-invoice.adapter.js";

function resolveInvoiceProvider(): "stripe" | "mock" {
  const explicit = (
    process.env.STRIPE_INVOICE_PROVIDER ??
    process.env.stripe_invoice_provider ??
    process.env.PSP_PROVIDER ??
    process.env.psp_provider ??
    ""
  ).toLowerCase();
  return explicit === "stripe" ? "stripe" : "mock";
}

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "invoicing" }),
  ],
  controllers: [InvoicingController, PublicInvoicingController],
  providers: [
    InvoiceStore,
    InvoicingService,
    MockStripeInvoiceAdapter,
    {
      provide: STRIPE_INVOICE_PORT,
      // AD-6 — configuration selects mock vs Stripe test (INT-189).
      useFactory: (mock: MockStripeInvoiceAdapter) => {
        if (resolveInvoiceProvider() === "stripe") {
          return new StripeInvoiceAdapter();
        }
        return mock;
      },
      inject: [MockStripeInvoiceAdapter],
    },
    { provide: READINESS_PORT, useClass: AlwaysReadyReadiness },
    // INT-223 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    {
      provide: SETTLEMENT_CLIENT,
      useFactory: () => createSettlementClient(),
    },
    SettlementCompletedListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
