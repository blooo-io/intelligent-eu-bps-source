import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { IdempotentConsumer } from "@intelligent/module-template";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";
import { mapErasureRequestedEnvelope } from "./erasure-envelope.js";

const SUBJECT = "ErasureRequested";

/** INT-275 / REQ-013 — AC-06 consumes ErasureRequested from AC-12. */
@Injectable()
export class ErasureRequestedListener implements OnModuleInit {
  private readonly logger = new Logger(ErasureRequestedListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const { eventId, requestId, participantId } =
      mapErasureRequestedEnvelope(payload);
    if (!eventId) {
      this.logger.warn("ErasureRequested missing eventId — skipping");
      return;
    }
    if (!requestId || !participantId) {
      this.logger.warn(
        `ErasureRequested ${eventId} missing requestId/participantId — skipping`,
      );
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      await this.invoicing.applyErasureRequested({
        requestId,
        participantId,
      });
    });
    if (result.status === "failed") {
      this.logger.error(
        `ErasureRequested ${eventId} failed: ${result.error.message}`,
      );
    }
  }
}
