export const TEMPORAL_CLIENT_PORT = Symbol("TEMPORAL_CLIENT_PORT");

export type StartWorkflowInput = {
  workflowType: string;
  workflowId: string;
  args: unknown[];
  taskQueue: string;
};

export type StartWorkflowResult =
  | { ok: true; runId: string }
  | { ok: false; error: string };

/**
 * Thin port over Temporal TypeScript SDK (INT-210 / TD-3).
 * Keeps @temporalio/client out of the default dependency graph until cluster wiring.
 */
export interface TemporalClientPort {
  startWorkflow(input: StartWorkflowInput): Promise<StartWorkflowResult>;
}
