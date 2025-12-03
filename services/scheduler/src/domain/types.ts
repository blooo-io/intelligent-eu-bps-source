/** Job names from contracts/openapi/components/schemas.yaml JobName. */
export type JobName =
  | "RefreshIntake"
  | "CheckIntakeHealth"
  | "StartRun"
  | "MarkOverdue"
  | "Reconcile"
  | "BuildReport"
  | "ExportKpi"
  | "RetryPending"
  | "PurgeCache"
  | "ApplyRetention"
  | "FetchRates";

export type JobDefinition = {
  jobId: string;
  name: JobName;
  ownerModule: string;
  /** Internal API path relative to /internal/v1. */
  path: string;
  method: "POST";
};

export type JobExecution = {
  jobId: string;
  name: JobName;
  communityId?: string;
  outcome: "accepted" | "succeeded" | "failed";
  lastRunAt: string;
  error?: string;
};
