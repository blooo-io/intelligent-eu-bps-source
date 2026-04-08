import { Connection, Client } from "@temporalio/client";
import type {
  StartWorkflowInput,
  StartWorkflowResult,
  TemporalClientPort,
} from "./temporal-client.port.js";

/**
 * INT-216 — real Temporal client (MIT @temporalio/client) for AC-14 dispatch.
 */
export class SdkTemporalClient implements TemporalClientPort {
  private clientPromise: Promise<Client> | null = null;

  constructor(
    private readonly address: string,
    private readonly namespace = "int",
  ) {}

  private async client(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const connection = await Connection.connect({ address: this.address });
        return new Client({ connection, namespace: this.namespace });
      })();
    }
    return this.clientPromise;
  }

  async startWorkflow(input: StartWorkflowInput): Promise<StartWorkflowResult> {
    try {
      const client = await this.client();
      const handle = await client.workflow.start(input.workflowType, {
        workflowId: input.workflowId,
        taskQueue: input.taskQueue,
        args: input.args,
      });
      return { ok: true, runId: handle.firstExecutionRunId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "temporal_start_failed",
      };
    }
  }
}
