import { asString } from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { InvoiceIssuedEvent } from "../domain/types.js";
import { NotificationService } from "../notification/notification.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECT = "InvoiceIssued";

/**
 * INT-428 Task 2.15 — bind AC-11 to InvoiceIssued (REQ-039 / UAT-050).
 * Reuses the AsyncAPI envelope unwrap pattern from operator-alerts.listener.
 */
@Injectable()
export class InvoiceNoticesListener implements OnModuleInit {
  private readonly logger = new Logger(InvoiceNoticesListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const event = mapInvoiceIssued(payload);
    await this.notifications.onInvoiceIssued(event);
  }
}

/** Same envelope shape as operator-alerts / payment-status listeners. */
function asEnvelope(payload: unknown): {
  eventId: string;
  communityId: string;
  data: Record<string, unknown>;
} {
  const envelope = payload as {
    eventId?: string;
    communityId?: string;
    data?: Record<string, unknown>;
  };
  return {
    eventId: asString(envelope.eventId),
    communityId: asString(envelope.communityId),
    data: envelope.data ?? {},
  };
}

function mapInvoiceIssued(payload: unknown): InvoiceIssuedEvent {
  const env = asEnvelope(payload);
  const data = env.data;
  const amounts = (data.amounts ?? {}) as Record<string, unknown>;
  return {
    eventId: env.eventId,
    communityId: env.communityId,
    invoiceId: asString(data.invoiceId),
    issuerId: asString(data.issuerId),
    recipientId: asString(data.recipientId),
    dueDate: asString(data.dueDate),
    total: asString(amounts.total ?? data.total),
    currency: asString(data.currency),
  };
}
