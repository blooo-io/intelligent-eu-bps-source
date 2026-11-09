import { buildJobCatalog } from "../domain/catalog.js";
import type { JobDefinition, JobName } from "../domain/types.js";

/**
 * INT-277 — Temporal cron schedules from 02 §4.5.
 * Cron is UTC. StartRun year-end uses type=final (INT-273 / BR-05).
 */
export type ScheduleSpec = {
  scheduleId: string;
  /** Temporal cronExpressions (5-field UTC). */
  cronExpressions: string[];
  jobName: JobName;
  /** Optional body overrides merged into the workflow args body. */
  body?: Record<string, unknown>;
  description: string;
};

const DEFAULT_COMMUNITY =
  process.env.SCHEDULE_COMMUNITY_ID ??
  "00000000-0000-4000-8000-000000000000";

export function buildScheduleCatalog(
  communityId: string = DEFAULT_COMMUNITY,
): ScheduleSpec[] {
  return [
    {
      scheduleId: "intelligent.refresh-intake.hourly",
      cronExpressions: ["0 * * * *"],
      jobName: "RefreshIntake",
      description: "Re-query recent trade windows (hourly)",
    },
    {
      scheduleId: "intelligent.check-intake-health.15m",
      cronExpressions: ["*/15 * * * *"],
      jobName: "CheckIntakeHealth",
      description: "Intake watchdog every 15 min",
    },
    {
      scheduleId: "intelligent.start-run.monthly",
      cronExpressions: ["0 2 1 * *"],
      jobName: "StartRun",
      // No period — AC-05 closes the last elapsed period of the community calendar.
      body: { communityId, type: "periodic" },
      description: "Close billing period monthly (day 1 02:00 UTC)",
    },
    {
      scheduleId: "intelligent.start-run.year-end-final",
      cronExpressions: ["0 3 31 12 *"],
      jobName: "StartRun",
      // No period — AC-05 labels the run with the current period of the community.
      body: { communityId, type: "final" },
      description: "Forced final invoices 31 Dec 03:00 UTC",
    },
    {
      scheduleId: "intelligent.mark-overdue.daily",
      cronExpressions: ["0 4 * * *"],
      jobName: "MarkOverdue",
      body: { communityId },
      description: "Overdue detection daily",
    },
    {
      scheduleId: "intelligent.reconcile.daily",
      cronExpressions: ["30 4 * * *"],
      jobName: "Reconcile",
      body: { scope: "invoice", communityId },
      description: "Reconciliation daily",
    },
    {
      scheduleId: "intelligent.retry-pending.5m",
      cronExpressions: ["*/5 * * * *"],
      jobName: "RetryPending",
      description: "Publication retry every 5 min",
    },
    {
      scheduleId: "intelligent.purge-cache.daily",
      cronExpressions: ["0 5 * * *"],
      jobName: "PurgeCache",
      description: "Gateway cache purge daily",
    },
    {
      scheduleId: "intelligent.apply-retention.daily",
      cronExpressions: ["0 6 * * *"],
      jobName: "ApplyRetention",
      description: "Personal-data retention daily",
    },
    {
      scheduleId: "intelligent.fetch-rates.weekdays",
      cronExpressions: ["0 7 * * 1-5"],
      jobName: "FetchRates",
      description: "Exchange-rate refresh business days",
    },
  ];
}

export function jobByName(name: JobName): JobDefinition {
  const job = buildJobCatalog().find((j) => j.name === name);
  if (!job) {
    throw new Error(`Unknown job ${name}`);
  }
  return job;
}

/** Resolve YEAR-12 placeholder to the schedule year's December period. */
export function materializeBody(
  body: Record<string, unknown> | undefined,
  now: Date = new Date(),
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if (out.period === "YEAR-12") {
    out.period = `${now.getUTCFullYear()}-12`;
  }
  // REQ-006 — StartRun(periodic) carries no period: the body is frozen when the
  // schedule is created, so AC-05 resolves the elapsed period at fire time.
  return out;
}
