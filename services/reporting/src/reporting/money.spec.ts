import { describe, expect, it } from "vitest";
import { addMoney, sumMoney } from "./money.js";

describe("money helpers (BR-08)", () => {
  it("adds and sums to two decimals", () => {
    expect(addMoney("10.00", "5.50")).toBe("15.50");
    expect(sumMoney(["1.00", "2.00", "3.25"])).toBe("6.25");
  });
});
