import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { IdempotentConsumer } from "@intelligent/module-template";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import {
  SETTLEMENT_CLIENT,
  type SettlementClientPort,
} from "../ports/settlement-client.port.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECT = "SettlementCompleted";

/**
 * INT-223 — bind AC-06 to SettlementCompleted (AsyncAPI receive).
 * Hydrates each pair settlement from AC-05 then createFromSettlement.
 * HTTP bridge POST invoices:from-settlement remains for operator / UAT seed.
 */
@Injectable()
export class SettlementCompletedListener implements OnModuleInit {
  private readonly logger = new Logger(SettlementCompletedListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
    @Inject(SETTLEMENT_CLIENT) private readonly settlements: SettlementClientPort,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const { eventId, pairSettlementIds } = mapEnvelope(payload);
    if (!eventId) {
      this.logger.warn("SettlementCompleted missing eventId — skipping");
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      for (const settlementId of pairSettlementIds) {
        const pair = await this.settlements.getPairSettlement(settlementId);
        await this.invoicing.createFromSettlement(pair);
      }
    });
    if (result.status === "failed") {
      this.logger.error(
        `SettlementCompleted ${eventId} failed: ${result.error.message}`,
      );
      throw result.error;
    }
  }
}

export function mapEnvelope(payload: unknown): {
  eventId: string;
  pairSettlementIds: string[];
} {
  const envelope = payload as {
    eventId?: string;
    data?: Record<string, unknown>;
  };
  const data = envelope.data ?? {};
  const raw = data.pairSettlementIds;
  const pairSettlementIds = Array.isArray(raw) ? raw.map(String) : [];
  return {
    eventId: String(envelope.eventId ?? ""),
    pairSettlementIds,
  };
}
