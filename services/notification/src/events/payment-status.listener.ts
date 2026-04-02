import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PaymentStatusEvent } from "../domain/types.js";
import { NotificationService } from "../notification/notification.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECT = "PaymentStatusChanged";

/**
 * INT-209 — bind AC-11 to the PaymentStatusChanged channel (AsyncAPI receive).
 * Works with InMemoryEventBus in CI; swap EVENT_BUS_PORT for NATS when outbox CDC is live.
 */
@Injectable()
export class PaymentStatusListener implements OnModuleInit {
  private readonly logger = new Logger(PaymentStatusListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const event = mapEnvelope(payload);
    await this.notifications.onPaymentStatusChanged(event);
  }
}

function mapEnvelope(payload: unknown): PaymentStatusEvent {
  const envelope = payload as {
    eventId?: string;
    communityId?: string;
    data?: Record<string, unknown>;
  };
  const data = envelope.data ?? {};
  return {
    eventId: String(envelope.eventId ?? ""),
    communityId: String(envelope.communityId ?? ""),
    paymentId: String(data.paymentId ?? ""),
    invoiceId: String(data.invoiceId ?? ""),
    status: String(data.status ?? ""),
    participantId: String(data.participantId ?? ""),
    failureCategory:
      typeof data.failureCategory === "string"
        ? data.failureCategory
        : undefined,
  };
}
