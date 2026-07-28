import { Client } from "@temporalio/client";
import { Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import {
  ensureSchedules,
  type ScheduleClientLike,
} from "../schedules/ensure-schedules.js";
import * as activities from "./activities.js";
import { connectWithRetry } from "./connect-retry.js";

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "intelligent-billing";

/**
 * INT-216 — Temporal worker process for AC-14 (same image, alternate CMD).
 * INT-227 — connectWithRetry before Worker.create.
 * INT-277 — register 02 §4.5 cron schedules on startup.
 */
async function main(): Promise<void> {
  const address =
    process.env.TEMPORAL_ADDRESS ?? process.env.TEMPORAL_HOST ?? "127.0.0.1:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "int";
  const connection = await connectWithRetry(address);
  const client = new Client({ connection, namespace });
  try {
    const schedules = await ensureSchedules(
      client as unknown as ScheduleClientLike,
      { taskQueue: TASK_QUEUE },
    );
    console.log(
      JSON.stringify({
        msg: "temporal_schedules_ensured",
        created: schedules.created.length,
        updated: schedules.updated.length,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "temporal_schedules_ensure_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    // Do not block the worker — operator can still :run jobs manually.
  }
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows.js", import.meta.url)),
    activities,
  });
  console.log(
    JSON.stringify({
      msg: "temporal_worker_started",
      address,
      namespace,
      taskQueue: TASK_QUEUE,
    }),
  );
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
