import type { JobDefinition, JobExecution } from "./types.js";
import { buildJobCatalog } from "./catalog.js";

export class SchedulerStore {
  private readonly catalog: JobDefinition[] = buildJobCatalog();
  private executions = new Map<string, JobExecution>();

  reset(): void {
    this.executions.clear();
  }

  listDefinitions(): JobDefinition[] {
    return this.catalog.map((j) => structuredClone(j));
  }

  getDefinition(jobId: string): JobDefinition | undefined {
    return this.catalog.find((j) => j.jobId === jobId);
  }

  putExecution(row: JobExecution): void {
    this.executions.set(row.jobId, structuredClone(row));
  }

  listExecutions(communityId?: string): JobExecution[] {
    return [...this.executions.values()]
      .filter((e) => !communityId || e.communityId === communityId)
      .map((e) => structuredClone(e));
  }

  getExecution(jobId: string): JobExecution | undefined {
    const row = this.executions.get(jobId);
    return row ? structuredClone(row) : undefined;
  }
}
