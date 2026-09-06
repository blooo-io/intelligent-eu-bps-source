import { asString } from "@intelligent/module-template";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SettlementService } from "../settlement/settlement.service.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECT = "ParticipantOffboarded";

/**
 * INT-273 / REQ-012 — AC-05 consumes ParticipantOffboarded → StartRun(type=final)
 * for pairs involving the leaving participant (BR-05).
 */
@Injectable()
export class ParticipantOffboardedListener implements OnModuleInit {
  private readonly logger = new Logger(ParticipantOffboardedListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(SettlementService) private readonly settlement: SettlementService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bus.subscribe(SUBJECT, (payload) => this.onMessage(payload));
    this.logger.log(`subscribed to ${SUBJECT}`);
  }

  async onMessage(payload: unknown): Promise<void> {
    const { communityId, participantId, effectiveAt } = mapEnvelope(payload);
    if (!communityId || !participantId) {
      this.logger.warn(
        "ParticipantOffboarded missing communityId/participantId — skip",
      );
      return;
    }
    const period = periodFromEffectiveAt(effectiveAt);
    const { runId } = await this.settlement.startRun({
      communityId,
      type: "final",
      period,
      onlyParticipantId: participantId,
    });
    this.logger.log(
      `final run ${runId} for offboarded participant (period=${period})`,
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function mapEnvelope(payload: unknown): {
  communityId: string;
  participantId: string;
  effectiveAt: string;
} {
  let cur: unknown = payload;
  if (typeof cur === "string") {
    try {
      cur = JSON.parse(cur);
    } catch {
      return { communityId: "", participantId: "", effectiveAt: "" };
    }
  }
  let env = asRecord(cur);
  if (env.payload !== undefined && env.schema !== undefined) {
    env = asRecord(env.payload);
  }
  if (env.after !== undefined && typeof env.after === "object") {
    const after = asRecord(env.after);
    if (after.event !== undefined) {
      const event =
        typeof after.event === "string"
          ? JSON.parse(after.event)
          : after.event;
      env = asRecord(event);
    }
  }
  const data = asRecord(env.data);
  return {
    communityId: asString(env.communityId ?? data.communityId),
    participantId: asString(data.participantId ?? env.participantId),
    effectiveAt: asString(data.effectiveAt ?? env.effectiveAt),
  };
}

/** Billing period YYYY-MM from offboard effectiveAt (UTC), else current month. */
export function periodFromEffectiveAt(effectiveAt: string): string {
  if (effectiveAt) {
    const d = new Date(effectiveAt);
    if (!Number.isNaN(d.getTime())) {
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${d.getUTCFullYear()}-${m}`;
    }
  }
  return new Date().toISOString().slice(0, 7);
}
