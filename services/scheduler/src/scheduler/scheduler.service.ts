import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OutboxService } from "@intelligent/module-template";
import { SchedulerStore } from "../domain/store.js";
import type { JobExecution, JobName } from "../domain/types.js";
import { DISPATCH_PORT, type DispatchPort } from "../dispatch/dispatch.port.js";
import type { MockDispatchAdapter } from "../dispatch/mock-dispatch.adapter.js";

const PRODUCER = "AC-14";
const DEFAULT_COMMUNITY = "00000000-0000-4000-8000-000000000000";

/**
 * AC-14 scheduler — decide when, dispatch command to owning module (INT-113).
 * Business logic stays in the owner; this module records JobExecution (02 §4.5).
 */
@Injectable()
export class SchedulerService {
  constructor(
    @Inject(SchedulerStore) private readonly store: SchedulerStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(DISPATCH_PORT) private readonly dispatch: DispatchPort,
    /** INT-273 — injectable clock for year-end final StartRun tests. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  resetStore(): void {
    this.store.reset();
    const mock = this.dispatch as MockDispatchAdapter;
    if (typeof mock.reset === "function") mock.reset();
  }

  failNext(jobName: JobName): void {
    const mock = this.dispatch as MockDispatchAdapter;
    if (typeof mock.failNext === "function") mock.failNext(jobName);
  }

  recordedDispatches() {
    return this.dispatch.recorded();
  }

  /**
   * List jobs for the operator view — catalogue merged with last execution.
   */
  listJobs(communityId?: string): Array<{
    jobId: string;
    name: string;
    communityId?: string;
    outcome?: string;
    lastRunAt?: string;
  }> {
    const defs = this.store.listDefinitions();
    return defs.map((def) => {
      const exec = this.store.getExecution(def.jobId);
      if (communityId && exec && exec.communityId !== communityId) {
        return {
          jobId: def.jobId,
          name: def.name,
        };
      }
      return {
        jobId: def.jobId,
        name: def.name,
        communityId: exec?.communityId,
        outcome: exec?.outcome,
        lastRunAt: exec?.lastRunAt,
      };
    });
  }

  /**
   * Run a job now (operator or Temporal trigger).
   * StartRun / UAT-006 — dispatches StartRun to AC-05 with community + period.
   */
  async runJob(
    jobId: string,
    input: { communityId?: string; period?: string } = {},
  ): Promise<{
    jobId: string;
    name: string;
    communityId?: string;
    outcome: string;
    lastRunAt: string;
  }> {
    const def = this.store.getDefinition(jobId);
    if (!def) throw new NotFoundException(`Unknown job ${jobId}`);

    const communityId = input.communityId || DEFAULT_COMMUNITY;
    const clock = this.now();
    const now = clock.toISOString();
    const body = this.buildBody(def.name, communityId, input.period, clock);

    const result = await this.dispatch.dispatch({ job: def, communityId, body });

    let execution: JobExecution;
    if (!result.ok) {
      execution = {
        jobId: def.jobId,
        name: def.name,
        communityId,
        outcome: "failed",
        lastRunAt: now,
        error: result.error,
      };
      this.store.putExecution(execution);
      await this.outbox.append({
        aggregateType: "Job",
        aggregateId: def.jobId,
        type: "JobFailed",
        producer: PRODUCER,
        communityId,
        billingMode: "virtual",
        data: { jobId: def.jobId, error: result.error },
      });
    } else {
      execution = {
        jobId: def.jobId,
        name: def.name,
        communityId,
        outcome: "succeeded",
        lastRunAt: now,
      };
      this.store.putExecution(execution);
    }

    return {
      jobId: execution.jobId,
      name: execution.name,
      communityId: execution.communityId,
      outcome: execution.outcome,
      lastRunAt: execution.lastRunAt,
    };
  }

  private buildBody(
    name: JobName,
    communityId: string,
    period?: string,
    now: Date = new Date(),
  ): Record<string, unknown> {
    switch (name) {
      case "StartRun": {
        const p = period ?? currentPeriod(now);
        // INT-273 / BR-05 — 31 Dec cron forces StartRun(type=final) (02 §4.5).
        const type = isYearEndFinalDay(now) ? "final" : "periodic";
        return {
          communityId,
          type,
          period: type === "final" ? `${now.getUTCFullYear()}-12` : p,
        };
      }
      case "RefreshIntake": {
        const to = new Date();
        const from = new Date(to.getTime() - 60 * 60 * 1000);
        return { from: from.toISOString(), to: to.toISOString() };
      }
      case "Reconcile":
        return { scope: "invoice", communityId };
      case "BuildReport":
      case "ExportKpi":
        return { communityId, period: period ?? currentPeriod() };
      case "FetchRates":
        return { date: new Date().toISOString().slice(0, 10) };
      case "PurgeCache":
        return { before: new Date().toISOString() };
      case "MarkOverdue":
        return { communityId };
      default:
        return {};
    }
  }
}

function currentPeriod(now: Date = new Date()): string {
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${m}`;
}

/** True on 31 December UTC — year-end forced final invoice (INT-273). */
export function isYearEndFinalDay(now: Date = new Date()): boolean {
  return now.getUTCMonth() === 11 && now.getUTCDate() === 31;
}
