import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ModuleTemplateModule } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { PaymentsStore } from "./domain/store.js";
import { InternalPaymentsController } from "./payments/internal.controller.js";
import { PaymentsController } from "./payments/payments.controller.js";
import { PaymentsService } from "./payments/payments.service.js";
import {
  createPaymentAccountsStore,
  PAYMENT_ACCOUNTS_STORE,
} from "./ports/payment-accounts.store.js";
import {
  HttpInvoiceLookup,
  InMemoryInvoiceLookup,
  INVOICE_LOOKUP,
} from "./ports/invoice-lookup.port.js";
import {
  HttpParticipantsNotifier,
  NoopParticipantsNotifier,
  PARTICIPANTS_NOTIFIER,
} from "./ports/participants-notifier.port.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";
import { PSP_PORT } from "./psp/psp.port.js";
import { resolvePspProvider } from "./psp/stripe-env.js";
import { StripePspAdapter } from "./psp/stripe-psp.adapter.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "payments" }),
  ],
  controllers: [PaymentsController, InternalPaymentsController],
  providers: [
    PaymentsStore,
    PaymentsService,
    MockPspAdapter,
    InMemoryInvoiceLookup,
    {
      provide: PAYMENT_ACCOUNTS_STORE,
      // INT-228 — Postgres when DATABASE_URL is set (CNPG payments DB).
      useFactory: () => createPaymentAccountsStore(),
    },
    {
      provide: PSP_PORT,
      // AD-6 — configuration selects mock vs Stripe test (INT-189).
      useFactory: (mock: MockPspAdapter) => {
        if (resolvePspProvider() === "stripe") {
          return new StripePspAdapter();
        }
        return mock;
      },
      inject: [MockPspAdapter],
    },
    {
      provide: INVOICE_LOOKUP,
      // INT-193 — AC-06 GetInvoice when INVOICING_INTERNAL_URL is set.
      useFactory: (memory: InMemoryInvoiceLookup) => {
        const base = process.env.INVOICING_INTERNAL_URL;
        const token =
          process.env.SERVICE_AUTH_TOKEN ?? process.env.INTERNAL_SERVICE_TOKEN ?? "service";
        if (base) {
          return new HttpInvoiceLookup(base, token);
        }
        return memory;
      },
      inject: [InMemoryInvoiceLookup],
    },
    {
      provide: PARTICIPANTS_NOTIFIER,
      // INT-193 — sync Ready update when PARTICIPANTS_INTERNAL_URL is set.
      useFactory: () => {
        const base = process.env.PARTICIPANTS_INTERNAL_URL;
        const token =
          process.env.SERVICE_AUTH_TOKEN ?? process.env.INTERNAL_SERVICE_TOKEN ?? "service";
        if (base) {
          return new HttpParticipantsNotifier(base, token);
        }
        return new NoopParticipantsNotifier();
      },
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
