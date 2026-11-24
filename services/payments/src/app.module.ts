import { Inject, Injectable, MiddlewareConsumer, Module, NestModule, OnModuleInit } from "@nestjs/common";
import { ModuleTemplateModule, OutboxService } from "@intelligent/module-template";
import { principalMiddleware } from "./auth/principal.middleware.js";
import { CLOCK, SystemClock } from "./domain/clock.js";
import { PayoutsStore } from "./domain/payouts.store.js";
import { PaymentsStore } from "./domain/store.js";
import { InternalPaymentsController } from "./payments/internal.controller.js";
import { PaymentsController } from "./payments/payments.controller.js";
import { PaymentsService } from "./payments/payments.service.js";
import { KycService } from "./kyc/kyc.service.js";
import { PayoutsController } from "./payouts/payouts.controller.js";
import { PayoutsService } from "./payouts/payouts.service.js";
import { createPaymentTransaction } from "./persistence/payment-journal.js";

@Injectable()
class PaymentPersistence implements OnModuleInit {
  constructor(
    @Inject(PaymentsStore) private readonly store: PaymentsStore,
    @Inject(PayoutsStore) private readonly payoutsStore: PayoutsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PayoutsService) private readonly payouts: PayoutsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { transaction, hydrate } = createPaymentTransaction(
      this.store,
      this.payoutsStore,
      this.outbox,
    );
    await hydrate();
    this.payments.useTransaction(transaction);
    this.payouts.useTransaction(transaction);
  }
}
import {
  createPaymentAccountsStore,
  PAYMENT_ACCOUNTS_STORE,
} from "./ports/payment-accounts.store.js";
import {
  createKycLogStore,
  KYC_LOG_STORE,
} from "./ports/kyc-log.store.js";
import {
  COMMUNITY_SETTINGS,
  createCommunitySettings,
  InMemoryCommunitySettings,
} from "./ports/community-settings.port.js";
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
import {
  HttpStatementLookup,
  InMemoryStatementLookup,
  STATEMENT_LOOKUP,
} from "./ports/statement-lookup.port.js";
import { COLLECT_PORT } from "./psp/collect.port.js";
import { KYC_ONBOARDING_PORT } from "./psp/kyc-onboarding.port.js";
import { KYC_TEST_FIXTURE_PORT } from "./psp/kyc-test-fixture.port.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";
import { PAYOUT_PORT } from "./psp/payout.port.js";
import {
  PAYOUT_EVENTS_HANDLER,
  PSP_ADAPTER,
  PSP_EVENTS_PORT,
} from "./psp/psp-events.port.js";
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
  controllers: [PaymentsController, InternalPaymentsController, PayoutsController],
  providers: [
    PaymentsStore,
    PaymentsService,
    KycService,
    PayoutsStore,
    PayoutsService,
    PaymentPersistence,
    { provide: CLOCK, useClass: SystemClock },
    MockPspAdapter,
    MockPspEraseAdapter,
    StripePspEraseAdapter,
    InMemoryInvoiceLookup,
    InMemoryStatementLookup,
    InMemoryCommunitySettings,
    {
      provide: COMMUNITY_SETTINGS,
      useFactory: (memory: InMemoryCommunitySettings) => createCommunitySettings(process.env, memory),
      inject: [InMemoryCommunitySettings],
    },
    {
      provide: PAYMENT_ACCOUNTS_STORE,
      useFactory: () => createPaymentAccountsStore(),
    },
    {
      provide: KYC_LOG_STORE,
      useFactory: () => createKycLogStore(),
    },
    {
      provide: PSP_ADAPTER,
      useFactory: (mock: MockPspAdapter) => {
        if (resolvePspProvider() === "stripe") {
          return new StripePspAdapter();
        }
        return mock;
      },
      inject: [MockPspAdapter],
    },
    { provide: KYC_ONBOARDING_PORT, useExisting: PSP_ADAPTER },
    { provide: COLLECT_PORT, useExisting: PSP_ADAPTER },
    { provide: PAYOUT_PORT, useExisting: PSP_ADAPTER },
    { provide: PSP_EVENTS_PORT, useExisting: PSP_ADAPTER },
    { provide: KYC_TEST_FIXTURE_PORT, useExisting: PSP_ADAPTER },
    { provide: PAYOUT_EVENTS_HANDLER, useExisting: PayoutsService },
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
      useFactory: (memory: InMemoryInvoiceLookup) => {
        const base = process.env.INVOICING_INTERNAL_URL;
        if (base) {
          return new HttpInvoiceLookup(base);
        }
        return memory;
      },
      inject: [InMemoryInvoiceLookup],
    },
    {
      provide: STATEMENT_LOOKUP,
      useFactory: (memory: InMemoryStatementLookup) => {
        const base = process.env.INVOICING_INTERNAL_URL;
        if (base) {
          return new HttpStatementLookup(base);
        }
        return memory;
      },
      inject: [InMemoryStatementLookup],
    },
    {
      provide: PARTICIPANTS_NOTIFIER,
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
