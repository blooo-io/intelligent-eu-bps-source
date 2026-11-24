import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { asString, IdempotentConsumer } from "@intelligent/module-template";
import { InvoicingService } from "../invoicing/invoicing.service.js";
import { StatementsService } from "../invoicing/statements.service.js";
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
    @Inject(StatementsService) private readonly statements: StatementsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const { eventId, pairSettlementIds } = mapEnvelope(payload);
    const runId = runIdOf(payload);
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
      await this.issueStatements(runId);
    });
    if (result.status === "failed") {
      this.logger.error(
        `SettlementCompleted ${eventId} failed: ${result.error.message}`,
      );
      // INT-223 / INT-368 — permanent settlement 404s must not nak forever.
      if (isNonRetryableInvoiceError(result.error)) {
        this.logger.warn(
          `SettlementCompleted ${eventId} non-retryable — acking without rethrow`,
        );
        // REQ-059 — the acked run is never redelivered, so the invoices it did
        // create get their statements now.
        await this.issueStatements(runId);
        return;
      }
      throw result.error;
    }
  }

  private async issueStatements(runId: string): Promise<void> {
    if (!runId) return;
    await this.statements.issueStatementsForRun(runId);
  }
}

/** REQ-059 — billing run of a SettlementCompleted envelope ("" when absent). */
export function runIdOf(payload: unknown): string {
  const envelope = unwrapEnvelope(payload);
  return asString(asRecord(envelope.data).runId ?? envelope.runId, "");
}

/**
 * Permanent errors — ack without redelivery.
 * INT-231 — readiness stays retryable so KYC can catch up.
 * A6 — Stripe Connect / acct_test_* patterns removed with Stripe Invoicing.
 */
export function isNonRetryableInvoiceError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  // Waitable integration signals — keep nak / redelivery.
  if (
    msg.includes("producer_not_ready") ||
    msg.includes("producer not ready")
  ) {
    return false;
  }
  // INT-368 — AC-05 commits the settlement with the outbox row, so a 404 on
  // GetPairSettlement never heals by redelivery.
  return /getpairsettlement \S+ failed with 404/.test(msg);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonUnknown(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function unwrapDebeziumAfter(rec: Record<string, unknown>): Record<string, unknown> {
  if (rec.after === undefined || typeof rec.after !== "object") return rec;
  const after = asRecord(rec.after);
  if (after.event === undefined) return rec;
  const event =
    typeof after.event === "string" ? parseJsonUnknown(after.event) : after.event;
  return asRecord(event);
}

function unwrapCloudEvents(rec: Record<string, unknown>): Record<string, unknown> {
  if (
    typeof rec.id !== "string" ||
    rec.data === undefined ||
    rec.eventId ||
    rec.pairSettlementIds
  ) {
    return rec;
  }
  const data = asRecord(rec.data);
  if (data.eventId || data.pairSettlementIds || data.data) {
    return data.eventId ? data : { eventId: rec.id, data };
  }
  return { eventId: rec.id, data };
}

/**
 * Unwrap Debezium EventRouter / JSON converter / CloudEvents shapes to the
 * AsyncAPI envelope (eventId + data.pairSettlementIds).
 */
export function unwrapEnvelope(payload: unknown): Record<string, unknown> {
  let cur: unknown = payload;
  if (typeof cur === "string") {
    const parsed = parseJsonUnknown(cur);
    if (parsed === undefined) return {};
    cur = parsed;
  }
  let rec = asRecord(cur);
  // JSON Converter: { schema, payload }
  if (rec.payload !== undefined && rec.schema !== undefined) {
    rec = asRecord(rec.payload);
  }
  rec = unwrapDebeziumAfter(rec);
  return unwrapCloudEvents(rec);
}

export function mapEnvelope(payload: unknown): {
  eventId: string;
  pairSettlementIds: string[];
} {
  const envelope = unwrapEnvelope(payload);
  const data = asRecord(envelope.data);
  // Some sinks flatten data onto the root.
  const raw = data.pairSettlementIds ?? envelope.pairSettlementIds ?? [];
  const pairSettlementIds = Array.isArray(raw)
    ? raw.map((id) => asString(id))
    : [];
  const fallbackId =
    pairSettlementIds.length > 0
      ? `settlement:${asString(data.runId ?? envelope.runId, "unknown")}:${pairSettlementIds.join(",")}`
      : "";
  const eventId = asString(envelope.eventId ?? envelope.id, fallbackId);
  return { eventId, pairSettlementIds };
}
