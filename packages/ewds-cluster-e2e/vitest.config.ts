import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    testTimeout: 60_000,
    // Cluster driver: only meaningful when MOCK_CGW_BASE_URL is set.
    // Local/CI unit path uses the in-process Mock CGW from @intelligent/ewds-client.
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
