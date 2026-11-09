import { describe, expect, it } from "vitest";
import {
  DEFAULT_OIDC_ROLE_CLAIM,
  resolveRoleClaimPath,
  rolesAtClaimPath,
} from "./role-claim.js";

describe("configurable OIDC role claim (NFR-013, INT-357)", () => {
  it("defaults to the Keycloak realm_access.roles path", () => {
    expect(DEFAULT_OIDC_ROLE_CLAIM).toBe("realm_access.roles");
    expect(resolveRoleClaimPath({})).toBe("realm_access.roles");
    expect(resolveRoleClaimPath({ OIDC_ROLE_CLAIM: "   " })).toBe("realm_access.roles");
  });

  it("reads OIDC_ROLE_CLAIM from env (trimmed)", () => {
    expect(resolveRoleClaimPath({ OIDC_ROLE_CLAIM: " roles " })).toBe("roles");
  });

  it("reads roles at the default path", () => {
    expect(
      rolesAtClaimPath({ realm_access: { roles: ["member", "manager"] } }, "realm_access.roles"),
    ).toEqual(["member", "manager"]);
  });

  it("reads a custom flat claim", () => {
    expect(rolesAtClaimPath({ roles: ["operator"] }, "roles")).toEqual(["operator"]);
  });

  it("reads a custom nested path", () => {
    expect(
      rolesAtClaimPath({ app: { billing: { roles: ["service"] } } }, "app.billing.roles"),
    ).toEqual(["service"]);
  });

  it("returns no roles when the claim is missing or not an array", () => {
    expect(rolesAtClaimPath({ roles: ["member"] }, "realm_access.roles")).toEqual([]);
    expect(rolesAtClaimPath({ realm_access: "member" }, "realm_access.roles")).toEqual([]);
    expect(rolesAtClaimPath({ realm_access: [["member"]] }, "realm_access.0")).toEqual([]);
    expect(rolesAtClaimPath({ roles: "member" }, "roles")).toEqual([]);
    expect(rolesAtClaimPath(null, "roles")).toEqual([]);
    expect(rolesAtClaimPath({ roles: ["member"] }, "roles..x")).toEqual([]);
  });

  it("drops non-string and empty entries", () => {
    expect(rolesAtClaimPath({ roles: ["member", "", 3, null] }, "roles")).toEqual(["member"]);
  });
});
