import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  asString,
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
  redactPersonalData,
} from "@intelligent/module-template";
import { MAIL_PORT, type MailPort } from "../mail/mail.port.js";
import { EVENT_BUS_PORT, type EventBusPort } from "./event-bus.port.js";

const SUBJECTS = [
  "JobFailed",
  "DiscrepancyDetected",
  "IntakeAnomalyDetected",
] as const;

/**
 * INT-274 — operator alerts for JobFailed / DiscrepancyDetected /
 * IntakeAnomalyDetected (03 §4). Fail soft when OPERATOR_ALERT_TO is unset.
 */
@Injectable()
export class OperatorAlertsListener implements OnModuleInit {
  private readonly logger = new Logger(OperatorAlertsListener.name);

  constructor(
    @Inject(EVENT_BUS_PORT) private readonly bus: EventBusPort,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
    @Inject(IdempotentConsumer)
    private readonly consumer: IdempotentConsumer = new IdempotentConsumer(
      new InMemoryProcessedEventsStore(),
    ),
  ) {}

  async onModuleInit(): Promise<void> {
    for (const subject of SUBJECTS) {
      await this.bus.subscribe(subject, (p) =>
        this.dedupe(p, () => this.onAlert(subject, p)),
      );
    }
    this.logger.log(`subscribed to ${SUBJECTS.join("/")}`);
  }

  async onAlert(subject: string, payload: unknown): Promise<void> {
    const to = process.env.OPERATOR_ALERT_TO?.trim();
    if (!to) {
      this.logger.debug(
        `operator alert ${subject} skipped — OPERATOR_ALERT_TO unset`,
      );
      return;
    }
    const env = asEnvelope(payload);
    const summary = summarize(subject, env.data);
    await this.mail.send({
      template: "operator-alert",
      to,
      subject: `[INTELLIGENT] ${subject}`,
      body: summary,
    });
    this.logger.log(
      JSON.stringify(
        redactPersonalData({
          msg: "notification.operator_alert",
          subject,
          eventId: env.eventId || randomUUID(),
          communityId: env.communityId,
        }),
      ),
    );
  }

  /** INT-339 — dedupe when the envelope carries an eventId. */
  private async dedupe(
    payload: unknown,
    work: () => Promise<void>,
  ): Promise<void> {
    const eventId = asString((payload as { eventId?: string }).eventId);
    if (!eventId) {
      await work();
      return;
    }
    const result = await this.consumer.handle(eventId, payload, async () => {
      await work();
    });
    if (result.status === "failed") throw result.error;
  }
}

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

function summarize(
  subject: string,
  data: Record<string, unknown>,
): string {
  const parts = [`alert=${subject}`];
  for (const key of ["jobId", "error", "scope", "expected", "actual", "type", "marketId", "details"]) {
    if (data[key] !== undefined) {
      parts.push(`${key}=${asString(data[key])}`);
    }
  }
  return parts.join("\n");
}
