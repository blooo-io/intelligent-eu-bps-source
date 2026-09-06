import { Injectable } from "@nestjs/common";
import type {
  DispatchCommand,
  DispatchPort,
  DispatchResult,
} from "./dispatch.port.js";

/**
 * V1 mock dispatcher — records commands (Temporal will own schedules later).
 * Fail when path contains "fail" in job name override via env SIMULATE_JOB_FAIL.
 */
@Injectable()
export class MockDispatchAdapter implements DispatchPort {
  private readonly calls: DispatchCommand[] = [];
  private readonly failNames = new Set<string>();

  reset(): void {
    this.calls.length = 0;
    this.failNames.clear();
  }

  /** Test helper: next dispatch of this job name fails. */
  failNext(jobName: string): void {
    this.failNames.add(jobName);
  }

  recorded(): readonly DispatchCommand[] {
    return [...this.calls];
  }

  async dispatch(command: DispatchCommand): Promise<DispatchResult> {
    this.calls.push(structuredClone(command));
    if (this.failNames.has(command.job.name)) {
      this.failNames.delete(command.job.name);
      return { ok: false, error: "owner_module_unavailable" };
    }
    return { ok: true };
  }
}
