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
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
    },
  },
});
