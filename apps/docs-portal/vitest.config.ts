import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

// INT-244 — 80% coverage gate via shared thresholds.
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      ...coverage,
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.spec.ts", "server/main.ts"],
    },
  },
});
