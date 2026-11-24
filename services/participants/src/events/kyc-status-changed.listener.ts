import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { IdempotentConsumer } from "@intelligent/module-template";
import { ParticipantsService } from "../participants/participants.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";
import { mapKycStatusChangedEnvelope } from "./kyc-status-envelope.js";

const SUBJECT = "KycStatusChanged";

/**
 * REQ-051 / REQ-045 — AC-03 consumes KycStatusChanged from AC-07 for
 * subjectType=participant and mirrors kycVerified into readiness (BR-09).
 */
@Injectable()
export class KycStatusChangedListener implements OnModuleInit {
  private readonly logger = new Logger(KycStatusChangedListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const { eventId, subjectId, subjectType, kycVerified } =
      mapKycStatusChangedEnvelope(payload);
    if (!eventId) {
      this.logger.warn("KycStatusChanged missing eventId — skipping");
      return;
    }
    // Manager KYC is tracked in AC-07; AC-03 only mirrors participant subjects.
    if (subjectType !== "participant") {
      return;
    }
    if (!subjectId) {
      this.logger.warn(
        `KycStatusChanged ${eventId} missing subjectId — skipping`,
      );
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      await this.participants.applyKycStatus({
        eventId,
        participantId: subjectId,
        kycVerified,
      });
    });
    if (result.status === "failed") {
      this.logger.error(
        `KycStatusChanged ${eventId} failed: ${result.error.message}`,
      );
    }
  }
}
