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
      this.logger.warn(
        `SettlementCompleted missing eventId — skipping (keys=${Object.keys(asRecord(payload)).join(",")})`,
      );
      return;
    }
    if (pairSettlementIds.length === 0) {
      this.logger.debug(
        `SettlementCompleted ${eventId} has no pairSettlementIds — ack only`,
      );
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
      // INT-223 — permanent Stripe Connect / fixture acct_test_* errors must not
      // nak forever; ack so JetStream stops redelivering poison messages.
      if (isNonRetryableInvoiceError(result.error)) {
        this.logger.warn(
          `SettlementCompleted ${eventId} non-retryable — acking without rethrow`,
        );
        return;
      }
      throw result.error;
    }
  }
}

/** Stripe missing Connect account / revoked access — not fixed by retry. */
export function isNonRetryableInvoiceError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("does not have access to account") ||
    msg.includes("acct_test_") ||
    msg.includes("no such account") ||
    msg.includes("producer not ready")
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Unwrap Debezium EventRouter / JSON converter / CloudEvents shapes to the
 * AsyncAPI envelope (eventId + data.pairSettlementIds).
 */
export function unwrapEnvelope(payload: unknown): Record<string, unknown> {
  let cur: unknown = payload;
  if (typeof cur === "string") {
    try {
      cur = JSON.parse(cur);
    } catch {
      return {};
    }
  }
  let rec = asRecord(cur);

  // JSON Converter: { schema, payload }
  if (rec.payload !== undefined && rec.schema !== undefined) {
    rec = asRecord(rec.payload);
  }
  // Raw CDC before EventRouter: { after: { event: {...} } }
  if (rec.after !== undefined && typeof rec.after === "object") {
    const after = asRecord(rec.after);
    if (after.event !== undefined) {
      const event =
        typeof after.event === "string"
          ? JSON.parse(after.event)
          : after.event;
      rec = asRecord(event);
    }
  }
  // CloudEvents: { id, data: envelope | data-only }
  if (
    typeof rec.id === "string" &&
    rec.data !== undefined &&
    !rec.eventId &&
    !rec.pairSettlementIds
  ) {
    const data = asRecord(rec.data);
    if (data.eventId || data.pairSettlementIds || data.data) {
      rec = data.eventId ? data : { eventId: rec.id, data };
    } else {
      rec = { eventId: String(rec.id), data };
    }
  }
  return rec;
}

export function mapEnvelope(payload: unknown): {
  eventId: string;
  pairSettlementIds: string[];
} {
  const envelope = unwrapEnvelope(payload);
  const data = asRecord(envelope.data);
  // Some sinks flatten data onto the root.
  const raw =
    data.pairSettlementIds ??
    envelope.pairSettlementIds ??
    [];
  const pairSettlementIds = Array.isArray(raw) ? raw.map(String) : [];
  const eventId = String(
    envelope.eventId ??
      envelope.id ??
      (pairSettlementIds.length > 0
        ? `settlement:${String(data.runId ?? envelope.runId ?? "unknown")}:${pairSettlementIds.join(",")}`
        : ""),
  );
  return { eventId, pairSettlementIds };
}
