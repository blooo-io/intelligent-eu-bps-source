import { describe, expect, it } from "vitest";
import { effectiveRoles } from "./effective-roles";

describe("effectiveRoles (INT-246)", () => {
  it("keeps non-empty identity roles", () => {
    expect(effectiveRoles(["member"], ["manager"])).toEqual(["member"]);
  });

  it("falls back to /v1/me when the token has no billing roles", () => {
    expect(effectiveRoles([], ["member"])).toEqual(["member"]);
    expect(effectiveRoles(undefined, ["manager", "member"])).toEqual([
      "manager",
      "member",
    ]);
  });

  it("returns empty when neither source has roles", () => {
    expect(effectiveRoles([], [])).toEqual([]);
    expect(effectiveRoles(undefined, undefined)).toEqual([]);
  });
});
