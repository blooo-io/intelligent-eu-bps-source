import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

// INT-244 — 80% coverage gate via shared thresholds.
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      ...coverage,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/schema.d.ts"],
    },
  },
});
