import { describe, expect, it } from "vitest";
import {
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
});
