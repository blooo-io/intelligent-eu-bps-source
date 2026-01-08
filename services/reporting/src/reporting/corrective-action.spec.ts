import { describe, expect, it } from "vitest";
import { suggestedCorrectiveAction } from "./corrective-action.js";

describe("suggestedCorrectiveAction (REQ-046)", () => {
  it("maps known failure categories", () => {
    expect(suggestedCorrectiveAction("insufficient_funds")).toMatch(/tops up/);
    expect(suggestedCorrectiveAction("authentication_required")).toMatch(
      /authentication/,
    );
    expect(suggestedCorrectiveAction("card_declined")).toMatch(/another card/);
    expect(suggestedCorrectiveAction("declined")).toMatch(/another card/);
  });

  it("returns empty for missing category and a generic hint otherwise", () => {
    expect(suggestedCorrectiveAction(undefined)).toBe("");
    expect(suggestedCorrectiveAction("unknown_psp_error")).toMatch(/Review/);
  });
});
