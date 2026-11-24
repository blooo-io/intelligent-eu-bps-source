import { describe, expect, it } from "vitest";
import {
  homeDescription,
  homeNextAction,
  isSellerRole,
  marketRoleLabel,
} from "./role-home";

describe("role-home (INT-252 / INT-429)", () => {
  it("distinguishes seller market roles", () => {
    expect(isSellerRole("producer")).toBe(true);
    expect(isSellerRole("prosumer")).toBe(true);
    expect(isSellerRole("consumer")).toBe(false);
    expect(marketRoleLabel("consumer")).toBe("Consumer");
  });

  it("uses consumer vs producer Home copy when Ready", () => {
    expect(
      homeDescription("member", "Ready", "Horizon Energy", "consumer"),
    ).toMatch(/buy energy/i);
    expect(
      homeDescription("member", "Ready", "Horizon Energy", "producer"),
    ).toMatch(/self-billing/i);
  });

  it("picks Pay vs Review next action from market role", () => {
    expect(homeNextAction("member", "Ready", "consumer")?.label).toMatch(
      /pay open invoices/i,
    );
    expect(homeNextAction("member", "Ready", "producer")?.label).toMatch(
      /review open invoices/i,
    );
    expect(
      homeNextAction("member", "TermsAccepted", "producer", false)?.label,
    ).toMatch(/verify identity/i);
    expect(
      homeNextAction("member", "TermsAccepted", "producer", false)?.to,
    ).toBe("/onboarding?step=identity");
  });

  it("INT-269 — prosumer Home copy and dual setup CTA", () => {
    expect(
      homeDescription("member", "Ready", "Horizon Energy", "prosumer"),
    ).toMatch(/buy and sell/i);
    expect(homeNextAction("member", "Ready", "prosumer")?.label).toMatch(
      /open invoices/i,
    );
    expect(
      homeNextAction("member", "TermsAccepted", "prosumer", true)?.label,
    ).toMatch(/card setup/i);
  });

  it("REQ-051 — unverified manager goes to identity verification", () => {
    expect(homeNextAction("manager", undefined, undefined, false)?.to).toBe(
      "/manager/verification",
    );
  });
});
