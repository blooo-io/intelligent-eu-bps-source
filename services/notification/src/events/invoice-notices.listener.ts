import { asString } from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type {
  InvoiceIssuedEvent,
  InvoiceOverdueEvent,
  PaymentReminderRequestedEvent,
} from "../domain/types.js";
import { NotificationService } from "../notification/notification.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECTS = [
  "InvoiceIssued",
  "PaymentReminderRequested",
  "InvoiceStatusChanged",
] as const;

/**
 * INT-428 — bind AC-11 to InvoiceIssued (REQ-039 / UAT-050),
 * PaymentReminderRequested and InvoiceStatusChanged Overdue (REQ-061 / UAT-078).
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
    await this.bus.subscribe("InvoiceIssued", (payload) =>
      this.onInvoiceIssued(payload),
    );
    await this.bus.subscribe("PaymentReminderRequested", (payload) =>
      this.onPaymentReminderRequested(payload),
    );
    await this.bus.subscribe("InvoiceStatusChanged", (payload) =>
      this.onInvoiceStatusChanged(payload),
    );
    this.logger.log(`subscribed to ${SUBJECTS.join("/")}`);
  }

  async onInvoiceIssued(payload: unknown): Promise<void> {
    const event = mapInvoiceIssued(payload);
    await this.notifications.onInvoiceIssued(event);
  }

  async onPaymentReminderRequested(payload: unknown): Promise<void> {
    const event = mapPaymentReminderRequested(payload);
    await this.notifications.onPaymentReminderRequested(event);
  }

  async onInvoiceStatusChanged(payload: unknown): Promise<void> {
    const mapped = mapInvoiceStatusChanged(payload);
    if (mapped.status !== "Overdue") {
      return;
    }
    await this.notifications.onInvoiceOverdue(mapped.event);
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

function mapPaymentReminderRequested(
  payload: unknown,
): PaymentReminderRequestedEvent {
  const env = asEnvelope(payload);
  const data = env.data;
  const reminderRaw = data.reminderNumber;
  const reminderNumber =
    typeof reminderRaw === "number"
      ? reminderRaw
      : Number.parseInt(asString(reminderRaw), 10);
  return {
    eventId: env.eventId,
    invoiceId: asString(data.invoiceId),
    recipientId: asString(data.recipientId),
    communityId: asString(data.communityId) || env.communityId,
    dueDate: asString(data.dueDate),
    outstanding: asString(data.outstanding),
    currency: asString(data.currency),
    reminderNumber: Number.isFinite(reminderNumber) ? reminderNumber : 1,
  };
}

function mapInvoiceStatusChanged(payload: unknown): {
  status: string;
  event: InvoiceOverdueEvent;
} {
  const env = asEnvelope(payload);
  const data = env.data;
  const dueDateRaw = data.dueDate;
  return {
    status: asString(data.status),
    event: {
      eventId: env.eventId,
      invoiceId: asString(data.invoiceId),
      communityId: env.communityId,
      outstanding: asString(data.outstanding),
      dueDate:
        typeof dueDateRaw === "string" && dueDateRaw.trim()
          ? dueDateRaw.trim()
          : undefined,
    },
  };
}
