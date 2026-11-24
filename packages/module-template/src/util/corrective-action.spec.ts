import { describe, expect, it } from "vitest";
import { suggestedCorrectiveAction } from "./corrective-action.js";

describe("suggestedCorrectiveAction (REQ-046 / UE-3)", () => {
  it.each([
    [
      "card_declined",
      "Use another card or contact your bank, then pay again from the billing portal",
    ],
    [
      "insufficient_funds",
      "Top up the account or choose another payment method, then pay again",
    ],
    [
      "authentication_required",
      "Complete the bank authentication (3-D Secure) and pay again",
    ],
    [
      "mandate_invalid",
      "Authorise a new SEPA Direct Debit mandate or pay by card",
    ],
    [
      "bank_account_invalid",
      "Update the bank account in your payment-provider onboarding, then withdraw again",
    ],
    ["provider_error", "Temporary payment-provider error: try again later"],
    ["other", "Contact your community manager"],
  ])("UE-3 %s", (c, t) => expect(suggestedCorrectiveAction(c)).toBe(t));

  it("falls back via legacy keywords, then generic for unknown", () => {
    expect(suggestedCorrectiveAction("balance_insufficient")).toBe(
      "Top up the account or choose another payment method, then pay again",
    );
    expect(suggestedCorrectiveAction("requires_3ds")).toBe(
      "Complete the bank authentication (3-D Secure) and pay again",
    );
    expect(suggestedCorrectiveAction("declined")).toBe(
      "Use another card or contact your bank, then pay again from the billing portal",
    );
    expect(suggestedCorrectiveAction("unknown_psp_error")).toBe(
      "Contact your community manager",
    );
  });

  it("returns generic text when category is missing", () => {
    expect(suggestedCorrectiveAction(undefined)).toBe(
      "Contact your community manager",
    );
  });
});
