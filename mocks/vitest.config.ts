import { defineConfig } from "vitest/config";
import { coverage } from "../config/vitest.shared.mjs";

// INT-101 / AC-15 — 80% coverage gate for the mock suite package.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      ...coverage,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/index.ts",
        // Type-only module; no runtime statements to cover.
        "src/types.ts",
      ],
    },
  },
});
