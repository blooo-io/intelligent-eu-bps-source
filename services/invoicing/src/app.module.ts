import { Inject, Injectable, MiddlewareConsumer, Module, NestModule, OnModuleInit } from "@nestjs/common";
import { ModuleTemplateModule, OutboxService } from "@intelligent/module-template";
import { servicePrincipalMiddleware } from "./auth/service-principal.middleware.js";
import { StatementStore } from "./domain/statement-store.js";
import { InvoiceStore } from "./domain/store.js";
import { EVENT_BUS_PORT } from "./events/event-bus.port.js";
import { createEventBus } from "./events/nats-event-bus.js";
import { ErasureRequestedListener } from "./events/erasure-requested.listener.js";
import { PaymentStatusListener } from "./events/payment-status.listener.js";
import { SettlementCompletedListener } from "./events/settlement-completed.listener.js";
import { InvoicingController } from "./invoicing/invoicing.controller.js";
import { PublicInvoicingController } from "./invoicing/public.controller.js";
import { InvoicingService } from "./invoicing/invoicing.service.js";
import {
  InternalStatementsController,
  PublicStatementsController,
} from "./invoicing/statements.controller.js";
import { StatementsService } from "./invoicing/statements.service.js";
import { createInvoiceTransaction } from "./persistence/invoice-journal.js";
import {
  createParticipantsResolver,
  PARTICIPANTS_RESOLVER,
} from "./ports/participants-resolver.port.js";
import {
  createReadiness,
  READINESS_PORT,
} from "./ports/readiness.port.js";
import {
  createSettlementClient,
  SETTLEMENT_CLIENT,
} from "./ports/settlement-client.port.js";

/** INT-356 / REQ-059 — load invoices and statements at boot and commit them with the outbox. */
@Injectable()
class InvoicePersistence implements OnModuleInit {
  constructor(
    @Inject(InvoiceStore) private readonly store: InvoiceStore,
    @Inject(StatementStore) private readonly statementStore: StatementStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
    @Inject(StatementsService) private readonly statements: StatementsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { transaction, hydrate } = createInvoiceTransaction(
      this.store,
      this.statementStore,
      this.outbox,
    );
    await hydrate();
    this.invoicing.useTransaction(transaction);
    this.statements.useTransaction(transaction);
  }
}

@Module({
  imports: [
    ModuleTemplateModule.forRoot({ moduleName: "invoicing" }),
  ],
  controllers: [
    InvoicingController,
    PublicInvoicingController,
    PublicStatementsController,
    InternalStatementsController,
  ],
  providers: [
    InvoiceStore,
    StatementStore,
    InvoicingService,
    StatementsService,
    InvoicePersistence,
    {
      provide: READINESS_PORT,
      // INT-231 — HttpReadiness when PARTICIPANTS_INTERNAL_URL is set (BR-09).
      useFactory: () => createReadiness(),
    },
    // INT-223 — NATS when NATS_URL set; in-memory otherwise (CI).
    { provide: EVENT_BUS_PORT, useFactory: () => createEventBus() },
    {
      provide: SETTLEMENT_CLIENT,
      useFactory: () => createSettlementClient(),
    },
    {
      provide: PARTICIPANTS_RESOLVER,
      // INT-236 — IdP sub → participantId for public invoice list/detail.
      useFactory: () => createParticipantsResolver(),
    },
    SettlementCompletedListener,
    // INT-270 — PaymentStatusChanged → invoice Paid.
    PaymentStatusListener,
    ErasureRequestedListener,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(servicePrincipalMiddleware).forRoutes("*");
  }
}
