import { defineConfig } from "vitest/config";
import { coverage } from "../../config/vitest.shared.mjs";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      ...coverage,
      include: ["src/**/*.ts"],
      // main.ts is the process entrypoint (side-effect start); helpers live in port.ts.
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
    },
  },
});
