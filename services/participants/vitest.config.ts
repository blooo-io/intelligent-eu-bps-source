import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

// INT-103 / AC-03 — 80% coverage gate.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      ...coverage,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
    },
  },
});
