import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { asString, redactPersonalData } from "@intelligent/module-template";
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
  ) {}

  async onModuleInit(): Promise<void> {
    for (const subject of SUBJECTS) {
      await this.bus.subscribe(subject, (p) => this.onAlert(subject, p));
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
