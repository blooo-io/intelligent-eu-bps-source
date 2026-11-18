import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { coverage } from "../../config/vitest.shared.mjs";

// INT-137 / AC-01 — 80% coverage gate (statements, branches, functions, lines).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // antd page specs with several fetch round trips exceed the 5 s default
    // under coverage on shared CI runners.
    testTimeout: 20_000,
    include: ["src/**/*.spec.{ts,tsx}", "server/**/*.spec.ts"],
    coverage: {
      ...coverage,
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: [
        "src/**/*.spec.{ts,tsx}",
        "server/**/*.spec.ts",
        "src/main.tsx",
        "src/test/**",
        "src/vite-env.d.ts",
        "server/main.ts",
      ],
    },
  },
});
