import { describe, expect, it } from "vitest";
import { communityIdFromClaims, rolesFromClaims } from "./claims";

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
});

describe("communityIdFromClaims", () => {
  it("prefers community_id then communityId", () => {
    expect(communityIdFromClaims({ community_id: "c1" })).toBe("c1");
    expect(communityIdFromClaims({ communityId: "c2" })).toBe("c2");
  });
});
