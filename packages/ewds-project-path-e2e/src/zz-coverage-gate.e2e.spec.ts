/**
 * INT-453 — single Vitest entry: import all journeys then assert S1–S14 coverage.
 * Journey files are pulled in here so markCovered() shares one module graph;
 * vitest.config include is this file only (avoids double registration).
 */
import { afterAll, describe, expect, it } from "vitest";
import { PROJECT_PATH_SCENARIOS } from "../fixtures/scenarios.js";
import { coveredIds } from "../fixtures/coverage-tracker.js";

import "./s01-s05-onboarding.e2e.spec.js";
import "./s03-s14-publication-commands.e2e.spec.js";
import "./s06-trades.e2e.spec.js";
import "./s12-erasure.e2e.spec.js";

describe("INT-453 EWDS project-path E2E registry", () => {
  it("catalogue lists exactly S1–S14", () => {
    expect(PROJECT_PATH_SCENARIOS.map((s) => s.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
      "S11",
      "S12",
      "S13",
      "S14",
    ]);
  });

  afterAll(() => {
    const missing = PROJECT_PATH_SCENARIOS.map((s) => s.id).filter(
      (id) => !coveredIds().has(id),
    );
    expect(
      missing,
      `Uncovered EWDS project-path scenarios: ${missing.join(", ")}. Add markCovered() in a journey test.`,
    ).toEqual([]);
  });
});
