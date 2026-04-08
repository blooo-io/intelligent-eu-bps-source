import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      ...coverage,
      include: ["src/**/*.ts"],
      // worker.ts / workflows.ts are Temporal process entrypoints (like main.ts).
      exclude: [
        "src/**/*.spec.ts",
        "src/main.ts",
        "src/temporal/worker.ts",
        "src/temporal/workflows.ts",
      ],
    },
  },
});
