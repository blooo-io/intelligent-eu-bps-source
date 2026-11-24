import { describe, expect, it } from "vitest";
import {
  bodyFor,
  buildScheduleCatalog,
  jobByName,
  materializeBody,
} from "./catalog.js";

describe("schedule catalog (INT-277)", () => {
  it("covers StartRun monthly and year-end final (02 §4.5)", () => {
    const specs = buildScheduleCatalog("c1");
    const ids = specs.map((s) => s.scheduleId);
    expect(ids).toContain("intelligent.start-run.monthly");
    expect(ids).toContain("intelligent.start-run.year-end-final");
    expect(ids).toContain("intelligent.fetch-rates.weekdays");
    const yearEnd = specs.find(
      (s) => s.scheduleId === "intelligent.start-run.year-end-final",
    )!;
    expect(yearEnd.cronExpressions).toEqual(["0 3 31 12 *"]);
    expect(yearEnd.body).toMatchObject({ type: "final", communityId: "c1" });
  });

  it("materializeBody resolves YEAR-12 and leaves the periodic period to AC-05 (INT-353)", () => {
    expect(
      materializeBody(
        { type: "final", period: "YEAR-12" },
        new Date("2026-12-31T03:00:00Z"),
      ),
    ).toEqual({ type: "final", period: "2026-12" });
    expect(
      materializeBody(
        { type: "periodic", communityId: "c1" },
        new Date("2026-12-01T02:00:00Z"),
      ),
    ).toEqual({
      type: "periodic",
      communityId: "c1",
    });
  });

  it("jobByName resolves catalogue entries", () => {
    expect(jobByName("StartRun").path).toBe("/billing-runs");
  });

  it("REQ-015: RunAutoPayouts is scheduled daily 08:00 UTC and owned by AC-07", () => {
    expect(
      buildScheduleCatalog("C").find((s) => s.jobName === "RunAutoPayouts"),
    ).toMatchObject({
      scheduleId: "intelligent.run-auto-payouts.daily",
      cronExpressions: ["0 8 * * *"],
      body: { communityId: "C" },
    });
    expect(jobByName("RunAutoPayouts")).toMatchObject({
      jobId: "a1000000-0000-4000-8000-00000000000c",
      ownerModule: "AC-07",
      path: "/payouts:run-auto",
      method: "POST",
    });
  });

  it("MarkOverdue and SendReminders carry asOf", () => {
    expect(bodyFor("MarkOverdue", "C", new Date("2026-12-02T09:00:00Z"))).toEqual({
      communityId: "C",
      asOf: "2026-12-02",
    });
    expect(bodyFor("MarkOverdue").asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(jobByName("SendReminders")).toMatchObject({
      jobId: "a1000000-0000-4000-8000-00000000000d",
      ownerModule: "AC-06",
      path: "/invoices:send-reminders",
      method: "POST",
    });
    expect(
      buildScheduleCatalog("C").find((s) => s.jobName === "SendReminders"),
    ).toMatchObject({
      scheduleId: "intelligent.send-reminders.daily",
      cronExpressions: ["0 9 * * *"],
      body: { communityId: "C", asOf: "today" },
    });
    expect(bodyFor("SendReminders", "C", new Date("2026-12-09T09:00:00Z"))).toEqual({
      communityId: "C",
      asOf: "2026-12-09",
    });
  });
});
