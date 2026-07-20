/**
 * INT-113 — AC-14 scheduler (REQ-006 / UAT-006, job catalogue 02 §4.5).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { SchedulerStore } from "../domain/store.js";
import { MockDispatchAdapter } from "../dispatch/mock-dispatch.adapter.js";
import { SchedulerService } from "./scheduler.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const START_RUN_ID = "a1000000-0000-4000-8000-000000000003";

describe("SchedulerService", () => {
  let store: SchedulerStore;
  let outboxStore: InMemoryOutboxStore;
  let dispatch: MockDispatchAdapter;
  let service: SchedulerService;

  beforeEach(() => {
    store = new SchedulerStore();
    outboxStore = new InMemoryOutboxStore();
    dispatch = new MockDispatchAdapter();
    service = new SchedulerService(
      store,
      new OutboxService(outboxStore),
      dispatch,
    );
  });

  it("lists the full JobName catalogue", () => {
    const jobs = service.listJobs();
    expect(jobs.map((j) => j.name).sort()).toEqual(
      [
        "ApplyRetention",
        "BuildReport",
        "CheckIntakeHealth",
        "ExportKpi",
        "FetchRates",
        "MarkOverdue",
        "PurgeCache",
        "Reconcile",
        "RefreshIntake",
        "RetryPending",
        "StartRun",
      ].sort(),
    );
  });

  it("UAT-006 — StartRun dispatches periodic run for the community period", async () => {
    const result = await service.runJob(START_RUN_ID, {
      communityId: COMMUNITY,
      period: "2026-09",
    });
    expect(result.outcome).toBe("succeeded");
    expect(result.name).toBe("StartRun");
    expect(service.recordedDispatches()).toHaveLength(1);
    expect(service.recordedDispatches()[0]).toMatchObject({
      communityId: COMMUNITY,
      job: { name: "StartRun", path: "/billing-runs" },
      body: {
        communityId: COMMUNITY,
        type: "periodic",
        period: "2026-09",
      },
    });
    expect(service.listJobs().find((j) => j.jobId === START_RUN_ID)?.outcome).toBe(
      "succeeded",
    );
  });

  it("publishes JobFailed when owner dispatch fails", async () => {
    service.failNext("StartRun");
    const result = await service.runJob(START_RUN_ID, {
      communityId: COMMUNITY,
      period: "2026-09",
    });
    expect(result.outcome).toBe("failed");
    const events = await outboxStore.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.event.type).toBe("JobFailed");
    expect(events[0]?.event.data).toEqual({
      jobId: START_RUN_ID,
      error: "owner_module_unavailable",
    });
  });

  it("INT-273: StartRun on 31 Dec dispatches type=final (BR-05)", async () => {
    service = new SchedulerService(
      store,
      new OutboxService(outboxStore),
      dispatch,
      () => new Date("2026-12-31T15:00:00Z"),
    );
    const result = await service.runJob(START_RUN_ID, {
      communityId: COMMUNITY,
    });
    expect(result.outcome).toBe("succeeded");
    expect(service.recordedDispatches()[0]?.body).toEqual({
      communityId: COMMUNITY,
      type: "final",
      period: "2026-12",
    });
  });

  it("returns 404 for unknown job id", async () => {
    await expect(
      service.runJob("ffffffff-ffff-4fff-8fff-ffffffffffff"),
    ).rejects.toThrow(/Unknown job/);
  });

  it("builds bodies for intake, reconcile, report, rates and purge jobs", async () => {
    const byName = Object.fromEntries(
      service.listJobs().map((j) => [j.name, j.jobId]),
    );
    await service.runJob(byName.RefreshIntake!, { communityId: COMMUNITY });
    await service.runJob(byName.Reconcile!, { communityId: COMMUNITY });
    await service.runJob(byName.BuildReport!, {
      communityId: COMMUNITY,
      period: "2026-09",
    });
    await service.runJob(byName.FetchRates!, { communityId: COMMUNITY });
    await service.runJob(byName.PurgeCache!, { communityId: COMMUNITY });
    await service.runJob(byName.MarkOverdue!, { communityId: COMMUNITY });
    await service.runJob(byName.ApplyRetention!, { communityId: COMMUNITY });

    const names = service.recordedDispatches().map((d) => d.job.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "RefreshIntake",
        "Reconcile",
        "BuildReport",
        "FetchRates",
        "PurgeCache",
        "MarkOverdue",
        "ApplyRetention",
      ]),
    );
    expect(
      service.recordedDispatches().find((d) => d.job.name === "RefreshIntake")
        ?.body,
    ).toHaveProperty("from");
    expect(
      service.recordedDispatches().find((d) => d.job.name === "Reconcile")?.body,
    ).toMatchObject({ scope: "invoice", communityId: COMMUNITY });
  });

  it("filters listJobs by community when an execution exists", async () => {
    await service.runJob(START_RUN_ID, {
      communityId: COMMUNITY,
      period: "2026-09",
    });
    const filtered = service.listJobs(COMMUNITY);
    expect(filtered.find((j) => j.jobId === START_RUN_ID)?.communityId).toBe(
      COMMUNITY,
    );
    const other = service.listJobs("99999999-9999-4999-8999-999999999999");
    expect(other.find((j) => j.jobId === START_RUN_ID)?.outcome).toBeUndefined();
  });
});
