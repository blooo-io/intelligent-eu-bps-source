import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { asString, IdempotentConsumer } from "@intelligent/module-template";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";
// INT-460 — same Debezium/CloudEvents unwrap as SettlementCompleted.
import { unwrapEnvelope } from "./settlement-completed.listener.js";

const SUBJECT = "PaymentStatusChanged";

/**
 * INT-270 / INT-130 — bind AC-06 to PaymentStatusChanged so Open invoices
 * become Paid after a succeeded direct charge on the producer account (BR-11).
 * A6 — no AC-07 confirmation call; the event status is authoritative after
 * CollectPort pay (Task 5.7) and invoicing no longer egresses to payments.
 * INT-460 — unwrap NATS/Debezium envelopes before reading eventId/data.
 */
@Injectable()
export class PaymentStatusListener implements OnModuleInit {
  private readonly logger = new Logger(PaymentStatusListener.name);

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
    const { eventId, invoiceId, paymentId, status } = mapEnvelope(payload);
    if (!eventId || !invoiceId || !paymentId) {
      this.logger.warn(
        `PaymentStatusChanged missing eventId/invoiceId — skipping`,
      );
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      const confirmedStatus = status.toLowerCase();
      if (confirmedStatus !== "succeeded" && confirmedStatus !== "paid") {
        return;
      }
      await this.invoicing.applyPaymentStatusChanged({
        invoiceId,
        paymentId,
        status,
      });
    });
    if (result.status === "failed") {
      this.logger.error(
        `PaymentStatusChanged ${eventId} failed: ${result.error.message}`,
      );
      throw result.error;
    }
  }
}

function mapEnvelope(payload: unknown): {
  eventId: string;
  invoiceId: string;
  paymentId: string;
  status: string;
} {
  // INT-460 — Debezium EventRouter wraps AsyncAPI as CloudEvents
  // `{ id, data: { eventId, data: { invoiceId, … } } }`; naive reads skip forever.
  const envelope = unwrapEnvelope(payload);
  const data =
    envelope.data !== null && typeof envelope.data === "object"
      ? (envelope.data as Record<string, unknown>)
      : {};
  // Some sinks flatten payment fields onto the root.
  return {
    eventId: asString(envelope.eventId ?? envelope.id),
    invoiceId: asString(data.invoiceId ?? envelope.invoiceId),
    paymentId: asString(data.paymentId ?? envelope.paymentId),
    status: asString(data.status ?? envelope.status),
  };
}
