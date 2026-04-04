import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  DispatchCommand,
  DispatchPort,
  DispatchResult,
} from "./dispatch.port.js";
import type { TemporalClientPort } from "./temporal-client.port.js";

/**
 * INT-210 — DispatchPort backed by Temporal workflows (TD-3).
 * Maps job catalogue names to workflow types on task queue `intelligent-billing`.
 */
@Injectable()
export class TemporalDispatchAdapter implements DispatchPort {
  private readonly calls: DispatchCommand[] = [];

  constructor(
    private readonly client: TemporalClientPort,
    private readonly taskQueue = "intelligent-billing",
  ) {}

  recorded(): readonly DispatchCommand[] {
    return [...this.calls];
  }

  async dispatch(command: DispatchCommand): Promise<DispatchResult> {
    this.calls.push(structuredClone(command));
    const workflowType = `Job_${command.job.name}`;
    const workflowId = `${command.job.name}-${command.communityId ?? "platform"}-${randomUUID()}`;
    const started = await this.client.startWorkflow({
      workflowType,
      workflowId,
      taskQueue: this.taskQueue,
      args: [
        {
          jobId: command.job.jobId,
          jobName: command.job.name,
          communityId: command.communityId,
          body: command.body,
        },
      ],
    });
    if (!started.ok) {
      return { ok: false, error: started.error };
    }
    return { ok: true };
  }
}

/** Stub client used when TEMPORAL_ADDRESS is set but SDK is not linked yet. */
export class UnconfiguredTemporalClient implements TemporalClientPort {
  async startWorkflow(): Promise<{ ok: false; error: string }> {
    return { ok: false, error: "temporal_sdk_not_linked" };
  }
}
