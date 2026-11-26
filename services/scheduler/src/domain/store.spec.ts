/**
 * INT-455 — cover SchedulerStore after public /v1 controller removal.
 */
import { describe, expect, it } from "vitest";
import { SchedulerStore } from "./store.js";

describe("SchedulerStore", () => {
  it("lists catalogue definitions and looks up by jobId", () => {
    const store = new SchedulerStore();
    const defs = store.listDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    const first = defs[0]!;
    expect(store.getDefinition(first.jobId)?.jobId).toBe(first.jobId);
    expect(store.getDefinition("missing-job")).toBeUndefined();
  });

  it("stores executions and filters by communityId", () => {
    const store = new SchedulerStore();
    const def = store.listDefinitions()[0]!;
    store.putExecution({
      jobId: def.jobId,
      name: def.name,
      communityId: "c-1",
      outcome: "succeeded",
      lastRunAt: "2026-11-26T00:00:00.000Z",
    });
    store.putExecution({
      jobId: `${def.jobId}-other`,
      name: def.name,
      communityId: "c-2",
      outcome: "failed",
      lastRunAt: "2026-11-26T00:00:01.000Z",
      error: "boom",
    });
    expect(store.listExecutions("c-1")).toHaveLength(1);
    expect(store.listExecutions("c-1")[0]?.communityId).toBe("c-1");
    expect(store.listExecutions().length).toBeGreaterThanOrEqual(2);
    expect(store.getExecution(def.jobId)?.outcome).toBe("succeeded");
    store.reset();
    expect(store.listExecutions()).toEqual([]);
  });
});
