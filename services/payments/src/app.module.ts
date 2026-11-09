import { Inject, Injectable, MiddlewareConsumer, Module, NestModule, OnModuleInit } from "@nestjs/common";
import { ModuleTemplateModule, OutboxService } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { PaymentsStore } from "./domain/store.js";
import { InternalPaymentsController } from "./payments/internal.controller.js";
import { PaymentsController } from "./payments/payments.controller.js";
import { PaymentsService } from "./payments/payments.service.js";
import { createPaymentTransaction } from "./persistence/payment-journal.js";

/** INT-356 — load payment attempts at boot and commit them with the outbox. */
@Injectable()
class PaymentPersistence implements OnModuleInit {
  constructor(
    @Inject(PaymentsStore) private readonly store: PaymentsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { transaction, hydrate } = createPaymentTransaction(this.store, this.outbox);
    await hydrate();
    this.payments.useTransaction(transaction);
  }
}
import {
  createPaymentAccountsStore,
  PAYMENT_ACCOUNTS_STORE,
} from "./ports/payment-accounts.store.js";
import {
  CONNECTED_CUSTOMERS_STORE,
  createConnectedCustomersStore,
} from "./ports/connected-customers.store.js";
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
import {
  createParticipantsResolver,
  PARTICIPANTS_RESOLVER,
} from "./ports/participants-resolver.port.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";
import { PSP_PORT } from "./psp/psp.port.js";
import { resolvePspProvider } from "./psp/stripe-env.js";
import { StripePspAdapter } from "./psp/stripe-psp.adapter.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { ErasureRequestedListener } from "./events/erasure-requested.listener.js";
import { MockPspEraseAdapter } from "./psp/mock-psp-erase.adapter.js";
import { PSP_ERASE_PORT } from "./psp/psp-erase.port.js";
import { StripePspEraseAdapter } from "./psp/stripe-psp-erase.adapter.js";

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "payments" }),
  ],
  controllers: [PaymentsController, InternalPaymentsController],
  providers: [
    PaymentsStore,
    PaymentsService,
    PaymentPersistence,
    MockPspAdapter,
    MockPspEraseAdapter,
    StripePspEraseAdapter,
    InMemoryInvoiceLookup,
    {
      provide: PAYMENT_ACCOUNTS_STORE,
      // INT-228 — Postgres when DATABASE_URL is set (CNPG payments DB).
      useFactory: () => createPaymentAccountsStore(),
    },
    {
      provide: CONNECTED_CUSTOMERS_STORE,
      // INT-355 — consumer Customer per producer Connect account (Postgres when DATABASE_URL set).
      useFactory: () => createConnectedCustomersStore(),
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
      provide: PSP_ERASE_PORT,
      useFactory: (
        mock: MockPspEraseAdapter,
        stripe: StripePspEraseAdapter,
      ) => {
        if (resolvePspProvider() === "stripe") {
          return stripe;
        }
        return mock;
      },
      inject: [MockPspEraseAdapter, StripePspEraseAdapter],
    },
    {
      provide: INVOICE_LOOKUP,
      // INT-193 — AC-06 GetInvoice when INVOICING_INTERNAL_URL is set.
      useFactory: (memory: InMemoryInvoiceLookup) => {
        const base = process.env.INVOICING_INTERNAL_URL;
        // INT-287 — Keycloak client-credentials when configured; else header dual-mode.
        if (base) {
          return new HttpInvoiceLookup(base);
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
        if (base) {
          return new HttpParticipantsNotifier(base);
        }
        return new NoopParticipantsNotifier();
      },
    },
    {
      provide: PARTICIPANTS_RESOLVER,
      // INT-230 — IdP sub → participantId for pay / onboarding.
      useFactory: () => createParticipantsResolver(),
    },
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    ErasureRequestedListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(principalMiddleware).forRoutes("*");
  }
}
