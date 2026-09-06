import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { asString, IdempotentConsumer } from "@intelligent/module-template";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECT = "PaymentStatusChanged";

/**
 * INT-270 / INT-130 — bind AC-06 to PaymentStatusChanged so Open invoices
 * become Paid after a succeeded destination charge (BR-11).
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
    if (!eventId || !invoiceId) {
      this.logger.warn(
        `PaymentStatusChanged missing eventId/invoiceId — skipping`,
      );
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
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
  const envelope = payload as {
    eventId?: string;
    data?: Record<string, unknown>;
  };
  const data = envelope.data ?? {};
  return {
    eventId: asString(envelope.eventId),
    invoiceId: asString(data.invoiceId),
    paymentId: asString(data.paymentId),
    status: asString(data.status),
  };
}
