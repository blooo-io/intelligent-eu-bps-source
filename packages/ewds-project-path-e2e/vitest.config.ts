import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * INT-453 — cross-module E2E for the EWDS project path.
 * Specs import service sources via aliases (no Nest bootstrap / no live CGW).
 */
export default defineConfig({
  test: {
    environment: "node",
    // Single entry imports the journey specs (shared markCovered registry).
    include: ["src/zz-coverage-gate.e2e.spec.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // Prefer package sources so Mock CGW / validators match the branch tip.
      "@intelligent/ewds-client": path.join(
        root,
        "packages/ewds-client/src/index.ts",
      ),
      "@participants": path.join(root, "services/participants/src"),
      "@publication": path.join(root, "services/publication/src"),
      "@trade-intake": path.join(root, "services/trade-intake/src"),
      "@compliance": path.join(root, "services/compliance/src"),
    },
  },
});
