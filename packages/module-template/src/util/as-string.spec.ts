import { describe, expect, it } from "vitest";
import { asString } from "./as-string.js";

describe("asString", () => {
  it("returns strings unchanged", () => {
    expect(asString("x")).toBe("x");
  });

  it("coerces number, boolean, and bigint", () => {
    expect(asString(1)).toBe("1");
    expect(asString(false)).toBe("false");
    expect(asString(2n)).toBe("2");
  });

  it("uses fallback for objects and nullish", () => {
    expect(asString({})).toBe("");
    expect(asString(null, "n")).toBe("n");
    expect(asString(undefined, "u")).toBe("u");
  });
});
