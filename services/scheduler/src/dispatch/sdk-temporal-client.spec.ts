import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const start = vi.fn();

vi.mock("@temporalio/client", () => ({
  Connection: { connect: (...args: unknown[]) => connect(...args) },
  Client: vi.fn().mockImplementation(() => ({
    workflow: { start: (...args: unknown[]) => start(...args) },
  })),
}));

const { SdkTemporalClient } = await import("./sdk-temporal-client.js");

describe("SdkTemporalClient (INT-216)", () => {
  beforeEach(() => {
    connect.mockReset();
    start.mockReset();
    connect.mockResolvedValue({ close: vi.fn() });
  });

  it("starts a workflow and returns the run id", async () => {
    start.mockResolvedValue({ firstExecutionRunId: "run-abc" });
    const client = new SdkTemporalClient("temporal:7233", "int");
    const result = await client.startWorkflow({
      workflowType: "Job_StartRun",
      workflowId: "StartRun-c1-1",
      taskQueue: "intelligent-billing",
      args: [{ jobName: "StartRun" }],
    });
    expect(result).toEqual({ ok: true, runId: "run-abc" });
    expect(connect).toHaveBeenCalledWith({ address: "temporal:7233" });
    expect(start).toHaveBeenCalledWith(
      "Job_StartRun",
      expect.objectContaining({
        workflowId: "StartRun-c1-1",
        taskQueue: "intelligent-billing",
      }),
    );
  });

  it("maps SDK errors to ok:false", async () => {
    start.mockRejectedValue(new Error("namespace missing"));
    const client = new SdkTemporalClient("temporal:7233");
    const result = await client.startWorkflow({
      workflowType: "Job_StartRun",
      workflowId: "x",
      taskQueue: "intelligent-billing",
      args: [],
    });
    expect(result).toEqual({ ok: false, error: "namespace missing" });
  });

  it("maps non-Error throws to temporal_start_failed", async () => {
    start.mockRejectedValue("boom");
    const client = new SdkTemporalClient("temporal:7233");
    const result = await client.startWorkflow({
      workflowType: "Job_StartRun",
      workflowId: "x",
      taskQueue: "intelligent-billing",
      args: [],
    });
    expect(result).toEqual({ ok: false, error: "temporal_start_failed" });
  });
});
