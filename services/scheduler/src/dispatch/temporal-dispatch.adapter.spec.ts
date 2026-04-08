import { describe, expect, it, vi } from "vitest";
import { createDispatchPort } from "./dispatch.factory.js";
import { MockDispatchAdapter } from "./mock-dispatch.adapter.js";
import {
  TemporalDispatchAdapter,
  UnconfiguredTemporalClient,
} from "./temporal-dispatch.adapter.js";

const job = {
  jobId: "a1000000-0000-4000-8000-000000000003",
  name: "StartRun" as const,
  ownerModule: "AC-05",
  path: "/billing-runs",
  method: "POST" as const,
};

describe("TemporalDispatchAdapter (INT-210)", () => {
  it("starts a workflow via TemporalClientPort", async () => {
    const startWorkflow = vi.fn(async () => ({ ok: true as const, runId: "run-1" }));
    const adapter = new TemporalDispatchAdapter({ startWorkflow });
    const result = await adapter.dispatch({
      job,
      communityId: "com-1",
      body: { period: "2026-11" },
    });
    expect(result).toEqual({ ok: true });
    expect(startWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowType: "Job_StartRun",
        taskQueue: "intelligent-billing",
      }),
    );
    expect(adapter.recorded()).toHaveLength(1);
  });

  it("surfaces client errors", async () => {
    const adapter = new TemporalDispatchAdapter(new UnconfiguredTemporalClient());
    const result = await adapter.dispatch({ job, body: {} });
    expect(result).toEqual({ ok: false, error: "temporal_sdk_not_linked" });
  });

  it("createDispatchPort selects mock or Temporal SDK adapter (INT-216)", () => {
    expect(createDispatchPort({ DISPATCH_PROVIDER: "mock" })).toBeInstanceOf(
      MockDispatchAdapter,
    );
    expect(
      createDispatchPort({ TEMPORAL_ADDRESS: "temporal.temporal:7233" }),
    ).toBeInstanceOf(TemporalDispatchAdapter);
  });
});
