import { describe, expect, it } from "vitest";
import { effectiveRoles } from "./effective-roles";

describe("effectiveRoles (INT-246 / INT-250)", () => {
  it("keeps non-empty identity billing roles", () => {
    expect(effectiveRoles(["member"], ["manager"])).toEqual(["member"]);
  });

  it("strips Keycloak system roles from the shell", () => {
    expect(
      effectiveRoles(
        [
          "offline_access",
          "member",
          "default-roles-int",
          "uma_authorization",
          "manage-account",
        ],
        [],
      ),
    ).toEqual(["member"]);
  });

  it("falls back to /v1/me when the token has no billing roles", () => {
    expect(effectiveRoles(["offline_access", "uma_authorization"], ["member"])).toEqual([
      "member",
    ]);
    expect(effectiveRoles([], ["manager", "member"])).toEqual([
      "manager",
      "member",
    ]);
  });

  it("returns empty when neither source has billing roles", () => {
    expect(effectiveRoles([], [])).toEqual([]);
    expect(effectiveRoles(["offline_access"], undefined)).toEqual([]);
    expect(effectiveRoles(undefined, undefined)).toEqual([]);
  });
});
