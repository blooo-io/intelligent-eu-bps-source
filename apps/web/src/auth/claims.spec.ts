import { describe, expect, it } from "vitest";
import { communityIdFromClaims, rolesAtClaimPath, rolesFromClaims } from "./claims";

describe("rolesFromClaims (REQ-049 / UAT-060)", () => {
  it("reads realm roles that map to billing CallerRole", () => {
    expect(
      rolesFromClaims({
        realm_access: { roles: ["member", "offline_access", "manager"] },
      }),
    ).toEqual(["member", "manager"]);
  });

  it("ignores unknown roles", () => {
    expect(rolesFromClaims({ realm_access: { roles: ["uma_authorization"] } })).toEqual([]);
  });

  it("merges resource_access roles", () => {
    expect(
      rolesFromClaims({
        resource_access: { web: { roles: ["operator"] } },
      }),
    ).toEqual(["operator"]);
  });

  // NFR-013 / INT-357 — role claim path is configuration.
  it("reads a custom flat role claim", () => {
    expect(rolesFromClaims({ roles: ["member", "operator"] }, "roles")).toEqual([
      "member",
      "operator",
    ]);
  });

  it("reads a custom nested role claim path", () => {
    expect(
      rolesFromClaims({ billing: { access: { roles: ["manager"] } } }, "billing.access.roles"),
    ).toEqual(["manager"]);
  });

  it("ignores realm_access when another claim path is configured", () => {
    expect(rolesFromClaims({ realm_access: { roles: ["manager"] } }, "roles")).toEqual([]);
  });

  it("yields no roles when the configured claim is missing or malformed", () => {
    expect(rolesFromClaims({}, "roles")).toEqual([]);
    expect(rolesFromClaims({ roles: "member" }, "roles")).toEqual([]);
    expect(rolesFromClaims({ app: ["member"] }, "app.roles")).toEqual([]);
    expect(rolesFromClaims({ app: null }, "app.roles")).toEqual([]);
    expect(rolesFromClaims({ roles: ["member"] }, ".roles")).toEqual([]);
  });
});

describe("rolesAtClaimPath", () => {
  it("drops non-string and empty entries", () => {
    expect(rolesAtClaimPath({ roles: ["member", "", 1] }, "roles")).toEqual(["member"]);
  });
});

describe("communityIdFromClaims", () => {
  it("prefers community_id then communityId", () => {
    expect(communityIdFromClaims({ community_id: "c1" })).toBe("c1");
    expect(communityIdFromClaims({ communityId: "c2" })).toBe("c2");
  });
});
