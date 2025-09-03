import { describe, expect, it } from "vitest";
import { redactPersonalData } from "./redact.js";

describe("redactPersonalData", () => {
  it("redacts e-mail addresses in free text", () => {
    expect(redactPersonalData("contact alice@example.com")).toBe(
      "contact [redacted-email]",
    );
  });

  it("redacts known personal-data keys while keeping identifiers", () => {
    expect(
      redactPersonalData({
        participantId: "11111111-1111-1111-1111-111111111111",
        email: "bob@example.com",
        name: "Bob",
      }),
    ).toEqual({
      participantId: "11111111-1111-1111-1111-111111111111",
      email: "[redacted]",
      name: "[redacted]",
    });
  });

  it("redacts nested arrays and IBAN-shaped strings", () => {
    expect(redactPersonalData(["x", "DE89370400440532013000"])).toEqual([
      "x",
      "[redacted-iban]",
    ]);
    expect(redactPersonalData(42)).toBe(42);
  });
});
