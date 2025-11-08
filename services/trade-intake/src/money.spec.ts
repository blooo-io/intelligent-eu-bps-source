import { describe, expect, it } from "vitest";
import { formatKWh, formatMoney } from "./money.js";

describe("formatMoney (BR-08)", () => {
  it("formats to two decimals", () => {
    expect(formatMoney(0.2)).toBe("0.20");
    expect(formatKWh(10)).toBe("10.00");
  });
});
