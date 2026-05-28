import { describe, expect, it } from "vitest";
import {
  homeAudience,
  homeDescription,
  homeNextAction,
  homeTitle,
} from "./role-home";

describe("role-home (INT-245)", () => {
  it("prefers manager over member when both present", () => {
    expect(homeAudience(["member", "manager"])).toBe("manager");
    expect(homeTitle("manager")).toMatch(/console/i);
  });

  it("resolves operator and unknown audiences", () => {
    expect(homeAudience(["operator"])).toBe("operator");
    expect(homeAudience([])).toBe("unknown");
    expect(homeTitle("operator")).toMatch(/operator desk/i);
    expect(homeTitle("unknown")).toBe("Home");
    expect(homeDescription("operator")).toMatch(/reconciliation/i);
    expect(homeDescription("unknown")).toMatch(/no billing role/i);
    expect(homeDescription("member")).toMatch(/balances/i);
  });

  it("points members at the next readiness step", () => {
    expect(homeNextAction("member", "Invited")?.to).toContain("onboarding");
    expect(homeNextAction("member", "ProfileCompleted")?.to).toContain("terms");
    expect(homeNextAction("member", "TermsAccepted")?.to).toContain("payment");
    expect(homeNextAction("member", "Ready")?.to).toBe("/invoices");
    expect(homeNextAction("member", "Restricted")).toBeNull();
    expect(homeNextAction("member", "Offboarded")).toBeNull();
    expect(homeNextAction("unknown")).toBeNull();
  });

  it("gives managers and operators a next action", () => {
    expect(homeNextAction("manager")?.to).toBe("/community-settings");
    expect(homeNextAction("operator")?.to).toBe("/operator");
    expect(homeDescription("manager")).toMatch(/billing runs/i);
  });
});
