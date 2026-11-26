import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    testTimeout: 60_000,
    // Cluster driver: MOCK_CGW_BASE_URL hits destinDev; otherwise in-process stub.
    coverage: {
      ...coverage,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"],
    },
  },
});
