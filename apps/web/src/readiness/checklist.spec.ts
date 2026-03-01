import { describe, expect, it } from "vitest";
import { readinessChecklist, readinessHeadline } from "./checklist";

describe("readinessChecklist", () => {
  it("marks no steps done when Invited and links to the wizard (INT-193)", () => {
    const items = readinessChecklist("Invited");
    expect(items.every((i) => !i.done)).toBe(true);
    expect(items.every((i) => i.to.startsWith("/onboarding"))).toBe(true);
  });

  it("marks profile done at ProfileCompleted", () => {
    const items = readinessChecklist("ProfileCompleted");
    expect(items.find((i) => i.id === "profile")?.done).toBe(true);
    expect(items.find((i) => i.id === "terms")?.done).toBe(false);
  });

  it("marks all done when Ready", () => {
    expect(readinessChecklist("Ready").every((i) => i.done)).toBe(true);
  });

  it("shows incomplete gates when Restricted", () => {
    expect(readinessChecklist("Restricted").every((i) => !i.done)).toBe(true);
  });
});

describe("readinessHeadline", () => {
  it("returns a ready message", () => {
    expect(readinessHeadline("Ready")).toMatch(/ready/i);
  });

  it("covers restricted, offboarded and in-progress headlines", () => {
    expect(readinessHeadline("Restricted")).toMatch(/restricted/i);
    expect(readinessHeadline("Offboarded")).toMatch(/offboarded/i);
    expect(readinessHeadline("Invited")).toMatch(/steps/i);
  });

  it("marks terms done at TermsAccepted", () => {
    const items = readinessChecklist("TermsAccepted");
    expect(items.find((i) => i.id === "terms")?.done).toBe(true);
    expect(items.find((i) => i.id === "payment")?.done).toBe(false);
  });

  it("marks gates incomplete when Offboarded", () => {
    expect(readinessChecklist("Offboarded").every((i) => !i.done)).toBe(true);
  });
});
