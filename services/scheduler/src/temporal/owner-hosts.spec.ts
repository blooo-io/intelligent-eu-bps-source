import { describe, expect, it } from "vitest";
import { resolveOwnerHost } from "./owner-hosts.js";

describe("resolveOwnerHost (INT-216)", () => {
  it("maps AC-05 to settlement Service DNS", () => {
    expect(resolveOwnerHost("AC-05")).toBe("settlement");
  });

  it("accepts chart service names", () => {
    expect(resolveOwnerHost("settlement")).toBe("settlement");
  });

  it("rejects unknown owners", () => {
    expect(() => resolveOwnerHost("AC-99")).toThrow(/unknown_owner_module/);
  });
});
