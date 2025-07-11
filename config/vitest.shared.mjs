import thresholds from "./coverage-thresholds.json" with { type: "json" };

/** Coverage settings every workspace Vitest config must spread into `test.coverage`. */
export const coverage = {
  provider: "v8",
  reporter: ["text", "json-summary", "lcov"],
  reportsDirectory: "./coverage",
  thresholds,
};
