import { describe, expect, it } from "vitest";
import {
  abs,
  add,
  compareAbs,
  dec,
  mul,
  neg,
  roundCentDec,
  roundTo,
  toFixed,
  toNumber,
} from "./decimal.js";
import { formatKWh, formatMoney, formatRate } from "./money.js";

describe("money (BR-08)", () => {
  it("rounds half away from zero to the cent", () => {
    expect(formatMoney(dec("1.005"))).toBe("1.01");
    expect(formatMoney(dec("-1.005"))).toBe("-1.01");
    expect(formatMoney(dec("0.2"))).toBe("0.20");
    expect(formatMoney(dec("-0.004"))).toBe("0.00");
  });

  it("keeps the ECB rate with 4 to 6 decimals (BR-06)", () => {
    expect(formatRate(dec(1))).toBe("1.0000");
    expect(formatRate(dec(0.9412))).toBe("0.9412");
    expect(formatRate(dec("0.937415"))).toBe("0.937415");
    expect(formatRate(dec("0.93741"))).toBe("0.93741");
  });

  it("shows energy to the watt-hour, unsigned", () => {
    expect(formatKWh(dec("-0.384"))).toBe("0.384");
    expect(formatKWh(dec("5"))).toBe("5.000");
  });
});

describe("decimal", () => {
  it("parses numbers from their decimal representation", () => {
    expect(dec(0.1)).toBe(100000000000n);
    expect(dec(1e-7)).toBe(100000n);
    expect(dec("12")).toBe(12000000000000n);
    expect(dec("-.5")).toBe(-500000000000n);
    expect(dec("0.0000000000005")).toBe(1n);
    expect(dec("-0.0000000000005")).toBe(-1n);
  });

  it("rejects invalid input", () => {
    expect(() => dec("abc")).toThrow(/invalid decimal/);
    expect(() => dec(".")).toThrow(/invalid decimal/);
    expect(() => dec(Number.NaN)).toThrow(/invalid decimal/);
  });

  it("multiplies and rounds exactly", () => {
    expect(toFixed(mul(dec("0.004"), dec("0.25")), 4)).toBe("0.0010");
    expect(toFixed(mul(dec("-2.5"), dec("0.9412")), 4)).toBe("-2.3530");
    expect(roundTo(dec("2.345"), 2)).toBe(dec("2.35"));
    expect(roundCentDec(dec("-2.345"))).toBe(dec("-2.35"));
  });

  it("supports the helpers used by settlement", () => {
    expect(add(dec(1), dec(2))).toBe(dec(3));
    expect(neg(dec(1))).toBe(dec(-1));
    expect(abs(dec(-1))).toBe(dec(1));
    expect(compareAbs(dec(-2), dec(2))).toBe(0);
    expect(compareAbs(dec(1), dec(-2))).toBe(-1);
    expect(compareAbs(dec(3), dec(2))).toBe(1);
    expect(toNumber(dec("0.384"))).toBe(0.384);
    expect(toFixed(dec("7.6"), 0)).toBe("8");
  });
});
