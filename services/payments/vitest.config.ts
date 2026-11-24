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
      exclude: [
        "src/**/*.spec.ts",
        "src/main.ts",
        // Contract-suite FakeStripe — test double, not production (Task 5.4).
        "src/psp/testing/**",
        // Symbol + interface ports until Task 5.6 wires DI tokens.
        "src/psp/collect.port.ts",
        "src/psp/kyc-onboarding.port.ts",
        "src/psp/kyc-test-fixture.port.ts",
        "src/psp/payout.port.ts",
        "src/psp/psp-events.port.ts",
      ],
    },
  },
});
