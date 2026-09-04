/**
 * INT-294 / INT-295 — quality gate packaging helpers (no live cluster).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DESIRED_GATE_CONDITIONS,
  LEGACY_RATING_METRICS,
  QUALITY_GATE_NAME,
  SOURCE_GATE_NAME,
  checkQualityGateLayout,
  conditionMatches,
  missingOverallConditions,
} from "./sonarqube-quality-gate.mjs";

test("Intelligent V1 overall conditions require MQR rating A and 80% coverage", () => {
  assert.equal(QUALITY_GATE_NAME, "Intelligent V1");
  assert.equal(SOURCE_GATE_NAME, "Sonar way");
  const byMetric = Object.fromEntries(
    DESIRED_GATE_CONDITIONS.map((c) => [c.metric, c]),
  );
  // Classic ratings are equivalent to MQR — Community allows only one family.
  assert.equal(byMetric.security_rating, undefined);
  assert.equal(byMetric.reliability_rating, undefined);
  assert.equal(byMetric.sqale_rating, undefined);
  assert.deepEqual(LEGACY_RATING_METRICS.sort(), [
    "reliability_rating",
    "security_rating",
    "sqale_rating",
  ]);
  assert.deepEqual(byMetric.software_quality_security_rating, {
    metric: "software_quality_security_rating",
    op: "GT",
    error: "1",
  });
  assert.deepEqual(byMetric.software_quality_reliability_rating, {
    metric: "software_quality_reliability_rating",
    op: "GT",
    error: "1",
  });
  assert.deepEqual(byMetric.software_quality_maintainability_rating, {
    metric: "software_quality_maintainability_rating",
    op: "GT",
    error: "1",
  });
  assert.deepEqual(byMetric.coverage, {
    metric: "coverage",
    op: "LT",
    error: "80",
  });
  assert.deepEqual(byMetric.duplicated_lines_density, {
    metric: "duplicated_lines_density",
    op: "GT",
    error: "10",
  });
  assert.deepEqual(byMetric.new_duplicated_lines_density, {
    metric: "new_duplicated_lines_density",
    op: "GT",
    error: "10",
  });
});

test("missingOverallConditions detects absent and mismatched thresholds", () => {
  const existing = [
    { metric: "software_quality_security_rating", op: "GT", error: "1" },
    { metric: "coverage", op: "LT", error: "70" },
  ];
  const missing = missingOverallConditions(existing);
  assert.equal(
    missing.some((c) => c.metric === "software_quality_security_rating"),
    false,
  );
  assert.equal(
    missing.some((c) => c.metric === "coverage" && c.error === "80"),
    true,
  );
  assert.equal(
    missing.some((c) => c.metric === "software_quality_reliability_rating"),
    true,
  );
  assert.equal(
    conditionMatches(
      { metric: "software_quality_maintainability_rating", op: "GT", error: "1" },
      { metric: "software_quality_maintainability_rating", op: "GT", error: "1" },
    ),
    true,
  );
});

test("quality gate is documented (INT-294 / INT-295)", async () => {
  const summary = await checkQualityGateLayout();
  assert.equal(summary.ok, true);
  assert.equal(summary.gate, QUALITY_GATE_NAME);
});
