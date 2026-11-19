import { describe, expect, it } from "vitest";
import { readinessLabel } from "./readiness-label";

describe("readinessLabel (INT-248)", () => {
  it("maps enums to plain language", () => {
    expect(readinessLabel("TermsAccepted")).toMatch(/set up payment/i);
    expect(readinessLabel("Ready")).toMatch(/ready/i);
    expect(readinessLabel("Invited")).toMatch(/profile/i);
    expect(readinessLabel("ProfileCompleted")).toMatch(/accept the terms/i);
    expect(readinessLabel("Restricted")).toMatch(/restricted/i);
    expect(readinessLabel("Offboarded")).toMatch(/offboarded/i);
    expect(readinessLabel(undefined)).toBe("Unknown");
    expect(readinessLabel("Custom" as never)).toBe("Custom");
  });
});
