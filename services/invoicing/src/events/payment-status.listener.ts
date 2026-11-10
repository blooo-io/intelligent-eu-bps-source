import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { asString, IdempotentConsumer } from "@intelligent/module-template";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import {
  PAYMENTS_CLIENT,
  type PaymentsClientPort,
} from "../ports/payments-client.port.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECT = "PaymentStatusChanged";

/**
 * INT-270 / INT-130 — bind AC-06 to PaymentStatusChanged so Open invoices
 * become Paid after a succeeded direct charge on the producer account (BR-11, INT-355).
 */
@Injectable()
export class PaymentStatusListener implements OnModuleInit {
  private readonly logger = new Logger(PaymentStatusListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Inject(PAYMENTS_CLIENT) private readonly payments: PaymentsClientPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const { eventId, invoiceId, paymentId } = mapEnvelope(payload);
    if (!eventId || !invoiceId || !paymentId) {
      this.logger.warn(
        `PaymentStatusChanged missing eventId/invoiceId — skipping`,
      );
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      // INT-338 / TP-7 — the event body is not authority for Paid.
      const confirmed = await this.payments.getPayment(paymentId);
      if (!confirmed || confirmed.invoiceId !== invoiceId) {
        this.logger.warn(
          `PaymentStatusChanged ${eventId} not confirmed by AC-07 — skipping`,
        );
        return;
      }
      const confirmedStatus = confirmed.status.toLowerCase();
      if (confirmedStatus !== "succeeded" && confirmedStatus !== "paid") {
        return;
      }
      await this.invoicing.applyPaymentStatusChanged({
        invoiceId,
        paymentId,
        status: confirmed.status,
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
