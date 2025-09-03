import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  assertCommunityScope,
  assertHasRole,
  ModuleAuthGuard,
} from "./auth.guard.js";
import type { AuthClaims } from "./auth.types.js";

const member: AuthClaims = {
  sub: "user-1",
  roles: ["member"],
  communityId: "c1",
  tokenUse: "user",
};

describe("ModuleAuthGuard (REQ-010)", () => {
  it("rejects a missing principal", () => {
    const guard = new ModuleAuthGuard({ roles: ["member"] });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a principal without the required role", () => {
    expect(() => assertHasRole(member, ["manager"])).toThrow(ForbiddenException);
  });

  it("rejects a community scope mismatch for user tokens", () => {
    expect(() => assertCommunityScope(member, "other")).toThrow(
      ForbiddenException,
    );
  });

  it("allows a service token across communities", () => {
    expect(() =>
      assertCommunityScope(
        { ...member, tokenUse: "service", roles: ["service"] },
        "other",
      ),
    ).not.toThrow();
  });

  it("allows a member in their own community", () => {
    const guard = new ModuleAuthGuard({
      roles: ["member"],
      requireCommunityScope: true,
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: member, params: { communityId: "c1" } }),
      }),
    };
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it("rejects a missing community param when scope is required", () => {
    expect(() => assertCommunityScope(member, undefined)).toThrow(
      ForbiddenException,
    );
  });
});
