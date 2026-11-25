import { describe, expect, it } from "vitest";
import { sumMoney } from "./money.js";

describe("sumMoney (BR-08)", () => {
  it("BR-08 sumMoney is exact", () => {
    expect(sumMoney("0.10", "0.20")).toBe("0.30");
    expect(sumMoney("2.00", "-2.00")).toBe("0.00");
  });
});
