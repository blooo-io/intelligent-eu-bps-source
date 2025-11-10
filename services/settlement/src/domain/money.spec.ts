import { describe, expect, it } from "vitest";
import { formatMoney, roundCent } from "./money.js";

describe("money (BR-08)", () => {
  it("rounds to the cent", () => {
    expect(roundCent(1.005)).toBe(1.01);
    expect(formatMoney(0.2)).toBe("0.20");
  });
});
