import { describe, expect, it, vi } from "vitest";
import { ensureSchedules } from "./ensure-schedules.js";

describe("ensureSchedules (INT-277)", () => {
  it("creates schedules when none exist", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const client = {
      schedule: {
        create,
        getHandle: vi.fn(),
      },
    };
    const result = await ensureSchedules(client, {
      communityId: "c1",
      taskQueue: "intelligent-billing",
      now: new Date("2026-11-01T00:00:00Z"),
    });
    expect(result.created.length).toBeGreaterThanOrEqual(8);
    expect(result.updated).toHaveLength(0);
    expect(create).toHaveBeenCalled();
    const yearEnd = create.mock.calls.find(
      (c) => c[0].scheduleId === "intelligent.start-run.year-end-final",
    )![0];
    expect(yearEnd.action.args[0].body).toMatchObject({
      type: "final",
      communityId: "c1",
    });
    expect(yearEnd.action.args[0].body.period).toBeUndefined();
    const monthly = create.mock.calls.find(
      (c) => c[0].scheduleId === "intelligent.start-run.monthly",
    )![0];
    expect(monthly.action.args[0].body).toEqual({ communityId: "c1", type: "periodic" });
  });

  it("updates when schedule already exists", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const create = vi
      .fn()
      .mockRejectedValue(new Error("schedule already exists"));
    const client = {
      schedule: {
        create,
        getHandle: vi.fn(() => ({ update, describe: vi.fn() })),
      },
    };
    const result = await ensureSchedules(client, { communityId: "c1" });
    expect(result.created).toHaveLength(0);
    expect(result.updated.length).toBeGreaterThan(0);
    expect(update).toHaveBeenCalled();
  });
});
