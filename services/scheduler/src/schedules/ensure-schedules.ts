import {
  buildScheduleCatalog,
  jobByName,
  materializeBody,
  type ScheduleSpec,
} from "./catalog.js";

/**
 * Narrow client surface for schedule upsert — keeps unit tests free of the
 * full Temporal Client generics (ScheduleOptionsStartWorkflowAction).
 */
export type ScheduleClientLike = {
  schedule: {
    create: (opts: Record<string, unknown>) => Promise<unknown>;
    getHandle: (id: string) => {
      update: (fn: (prev: unknown) => unknown) => Promise<unknown>;
      describe: () => Promise<unknown>;
    };
  };
};

/**
 * INT-277 — create or refresh Temporal schedules for the 02 §4.5 catalogue.
 * Idempotent: existing scheduleIds are updated in place.
 */
export async function ensureSchedules(
  client: ScheduleClientLike,
  opts: {
    taskQueue?: string;
    communityId?: string;
    now?: Date;
  } = {},
): Promise<{ created: string[]; updated: string[] }> {
  const taskQueue = opts.taskQueue ?? process.env.TEMPORAL_TASK_QUEUE ?? "intelligent-billing";
  const specs = buildScheduleCatalog(opts.communityId);
  const created: string[] = [];
  const updated: string[] = [];

  for (const spec of specs) {
    const action = buildScheduleAction(spec, taskQueue, opts.now);
    try {
      await client.schedule.create({
        scheduleId: spec.scheduleId,
        spec: { cronExpressions: spec.cronExpressions },
        action,
        state: { note: spec.description },
      });
      created.push(spec.scheduleId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already|exist/i.test(msg)) {
        throw err;
      }
      const handle = client.schedule.getHandle(spec.scheduleId);
      await handle.update((prev: unknown) => {
        const p = (prev ?? {}) as Record<string, unknown>;
        return {
          ...p,
          spec: { cronExpressions: spec.cronExpressions },
          action,
          state: { ...(p.state as object), note: spec.description },
        };
      });
      updated.push(spec.scheduleId);
    }
  }
  return { created, updated };
}

function buildScheduleAction(
  spec: ScheduleSpec,
  taskQueue: string,
  now?: Date,
): Record<string, unknown> {
  const job = jobByName(spec.jobName);
  const body = materializeBody(spec.body, now);
  return {
    type: "startWorkflow",
    workflowType: `Job_${spec.jobName}`,
    taskQueue,
    args: [
      {
        jobId: job.jobId,
        jobName: job.name,
        ownerModule: job.ownerModule,
        path: job.path,
        method: job.method,
        communityId: body.communityId,
        body,
      },
    ],
  };
}
