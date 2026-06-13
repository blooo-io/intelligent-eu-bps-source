import { describe, expect, it } from "vitest";
import {
  homeDescription,
  homeNextAction,
  isSellerRole,
  marketRoleLabel,
} from "./role-home";

describe("role-home (INT-252)", () => {
  it("distinguishes seller market roles", () => {
    expect(isSellerRole("producer")).toBe(true);
    expect(isSellerRole("prosumer")).toBe(true);
    expect(isSellerRole("consumer")).toBe(false);
    expect(marketRoleLabel("consumer")).toBe("Consumer");
  });

  it("uses consumer vs producer Home copy when Ready", () => {
    expect(
      homeDescription("member", "Ready", "Demo community S1", "consumer"),
    ).toMatch(/buy energy/i);
    expect(
      homeDescription("member", "Ready", "Demo community S1", "producer"),
    ).toMatch(/self-billing/i);
  });

  it("picks Pay vs Review next action from market role", () => {
    expect(homeNextAction("member", "Ready", "consumer")?.label).toMatch(
      /pay open invoices/i,
    );
    expect(homeNextAction("member", "Ready", "producer")?.label).toMatch(
      /review open invoices/i,
    );
    expect(homeNextAction("member", "TermsAccepted", "producer")?.label).toMatch(
      /stripe connect/i,
    );
  });
});
