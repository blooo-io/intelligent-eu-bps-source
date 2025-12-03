import { randomUUID } from "node:crypto";
import type { JobDefinition, JobName } from "./types.js";

/**
 * Static V1 job catalogue (INT-113 / 02 §4.5).
 * Stable jobId per name so operators can POST /jobs/{id}:run.
 */
const SPECS: Array<{
  name: JobName;
  ownerModule: string;
  path: string;
}> = [
  { name: "RefreshIntake", ownerModule: "AC-04", path: "/intake:refresh" },
  {
    name: "CheckIntakeHealth",
    ownerModule: "AC-04",
    path: "/intake:check-health",
  },
  { name: "StartRun", ownerModule: "AC-05", path: "/billing-runs" },
  { name: "MarkOverdue", ownerModule: "AC-06", path: "/invoices:mark-overdue" },
  { name: "Reconcile", ownerModule: "AC-08", path: "/reconciliation:run" },
  { name: "BuildReport", ownerModule: "AC-09", path: "/reports:build" },
  { name: "ExportKpi", ownerModule: "AC-09", path: "/kpi-exports" },
  {
    name: "RetryPending",
    ownerModule: "AC-10",
    path: "/publication:retry-pending",
  },
  { name: "PurgeCache", ownerModule: "AC-10", path: "/publication:purge-cache" },
  { name: "ApplyRetention", ownerModule: "AC-12", path: "/retention:apply" },
  { name: "FetchRates", ownerModule: "AC-13", path: "/rates:fetch" },
];

/** Deterministic UUID v5-like ids from name (fixed map for tests/operators). */
const FIXED_IDS: Record<JobName, string> = {
  RefreshIntake: "a1000000-0000-4000-8000-000000000001",
  CheckIntakeHealth: "a1000000-0000-4000-8000-000000000002",
  StartRun: "a1000000-0000-4000-8000-000000000003",
  MarkOverdue: "a1000000-0000-4000-8000-000000000004",
  Reconcile: "a1000000-0000-4000-8000-000000000005",
  BuildReport: "a1000000-0000-4000-8000-000000000006",
  ExportKpi: "a1000000-0000-4000-8000-000000000007",
  RetryPending: "a1000000-0000-4000-8000-000000000008",
  PurgeCache: "a1000000-0000-4000-8000-000000000009",
  ApplyRetention: "a1000000-0000-4000-8000-00000000000a",
  FetchRates: "a1000000-0000-4000-8000-00000000000b",
};

export function buildJobCatalog(): JobDefinition[] {
  return SPECS.map((spec) => ({
    jobId: FIXED_IDS[spec.name] ?? randomUUID(),
    name: spec.name,
    ownerModule: spec.ownerModule,
    path: spec.path,
    method: "POST" as const,
  }));
}
