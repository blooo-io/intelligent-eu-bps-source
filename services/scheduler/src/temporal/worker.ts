import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./activities.js";

const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "intelligent-billing";

/**
 * INT-216 — Temporal worker process for AC-14 (same image, alternate CMD).
 */
async function main(): Promise<void> {
  const address =
    process.env.TEMPORAL_ADDRESS ?? process.env.TEMPORAL_HOST ?? "127.0.0.1:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "int";
  const connection = await NativeConnection.connect({ address });
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
