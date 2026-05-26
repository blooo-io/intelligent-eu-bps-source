import { describe, expect, it } from "vitest";
import { visibleNavItems } from "./nav-access";

describe("visibleNavItems (INT-243)", () => {
  it("hides manager and operator screens from members", () => {
    const keys = visibleNavItems(["member"], "Ready").map((i) => i.key);
    expect(keys).toContain("/");
    expect(keys).toContain("/invoices");
    expect(keys).not.toContain("/community-settings");
    expect(keys).not.toContain("/billing-runs");
    expect(keys).not.toContain("/operator");
  });

  it("gates balances/invoices until TermsAccepted", () => {
    const invited = visibleNavItems(["member"], "Invited").map((i) => i.key);
    expect(invited).toContain("/onboarding");
    expect(invited).not.toContain("/balances");
    expect(invited).not.toContain("/invoices");

    const terms = visibleNavItems(["member"], "TermsAccepted").map((i) => i.key);
    expect(terms).toContain("/balances");
    expect(terms).toContain("/invoices");
  });

  it("shows manager community screens without member readiness", () => {
    const keys = visibleNavItems(["manager"], "Invited").map((i) => i.key);
    expect(keys).toContain("/community-settings");
    expect(keys).toContain("/billing-runs");
    expect(keys).toContain("/participants");
    expect(keys).not.toContain("/operator");
    expect(keys).not.toContain("/onboarding");
  });

  it("shows operator screen only for operators", () => {
    const keys = visibleNavItems(["operator"]).map((i) => i.key);
    expect(keys).toContain("/operator");
    expect(keys).toContain("/");
    expect(keys).not.toContain("/billing-runs");
  });
});
