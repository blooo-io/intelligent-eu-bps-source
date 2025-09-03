import { DynamicModule, Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import {
  MODULE_NAME,
  OUTBOX_STORE,
  PROCESSED_EVENTS_STORE,
} from "./module-template.tokens.js";
import { OutboxService } from "./outbox/outbox.service.js";
import {
  InMemoryOutboxStore,
  type OutboxStore,
} from "./outbox/outbox.types.js";
import { IdempotentConsumer } from "./consumer/idempotent-consumer.js";
import {
  InMemoryProcessedEventsStore,
  type ProcessedEventsStore,
} from "./consumer/idempotent-consumer.js";

export type ModuleTemplateOptions = {
  moduleName: string;
  outboxStore?: OutboxStore;
  processedEventsStore?: ProcessedEventsStore;
};

/**
 * Shared NestJS wiring for health, outbox and idempotent consumption (TD-4).
 * Auth guard is constructed per-route with roles; OpenAPI validator is added by each service.
 */
@Module({})
export class ModuleTemplateModule {
  static forRoot(options: ModuleTemplateOptions): DynamicModule {
    const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
    const processedEventsStore =
      options.processedEventsStore ?? new InMemoryProcessedEventsStore();

    return {
      module: ModuleTemplateModule,
      providers: [
        { provide: MODULE_NAME, useValue: options.moduleName },
        { provide: OUTBOX_STORE, useValue: outboxStore },
        { provide: PROCESSED_EVENTS_STORE, useValue: processedEventsStore },
        {
          provide: OutboxService,
          useFactory: (store: OutboxStore) => new OutboxService(store),
          inject: [OUTBOX_STORE],
        },
        {
          provide: IdempotentConsumer,
          useFactory: (store: ProcessedEventsStore) =>
            new IdempotentConsumer(store),
          inject: [PROCESSED_EVENTS_STORE],
        },
      ],
      controllers: [HealthController],
      exports: [OutboxService, IdempotentConsumer, MODULE_NAME],
    };
  }
}
