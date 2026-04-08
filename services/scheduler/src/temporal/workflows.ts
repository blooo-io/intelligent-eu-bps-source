/**
 * INT-216 — Temporal workflows for AC-14 job catalogue (TD-3).
 * Keep this file free of Nest/Node APIs so the workflow bundle stays deterministic.
 */
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities.js";

const { invokeOwnerModule } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
});

export type JobWorkflowInput = {
  jobId: string;
  jobName: string;
  ownerModule: string;
  path: string;
  method: "POST";
  communityId?: string;
  body: Record<string, unknown>;
};

async function runJob(input: JobWorkflowInput): Promise<{ status: number }> {
  return invokeOwnerModule({
    ownerModule: input.ownerModule,
    path: input.path,
    method: input.method,
    body: input.body,
  });
}

/** One workflow type per catalogue job — started as `Job_${name}`. */
export async function Job_RefreshIntake(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_CheckIntakeHealth(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_StartRun(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_MarkOverdue(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_Reconcile(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_BuildReport(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_ExportKpi(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_RetryPending(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_PurgeCache(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_ApplyRetention(input: JobWorkflowInput) {
  return runJob(input);
}
export async function Job_FetchRates(input: JobWorkflowInput) {
  return runJob(input);
}
