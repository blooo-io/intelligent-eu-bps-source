import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

// INT-156: same 80% gate as every workspace package with source.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage,
  },
});
