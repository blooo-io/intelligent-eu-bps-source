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

  // INT-290 — operator must not inherit service community bypass.
  it("rejects an operator outside their community", () => {
    expect(() =>
      assertCommunityScope(
        {
          sub: "op-1",
          roles: ["operator"],
          communityId: "c1",
          tokenUse: "user",
        },
        "other",
      ),
    ).toThrow(ForbiddenException);
  });

  // REQ-049 — community id may be the communityId query (reports summary).
  it("allows a manager when the communityId query matches the token", () => {
    const guard = new ModuleAuthGuard({
      roles: ["manager"],
      requireCommunityScope: true,
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { ...member, roles: ["manager"] },
          params: {},
          query: { communityId: "c1" },
        }),
      }),
    };
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it("rejects a communityId query outside the token community", () => {
    const guard = new ModuleAuthGuard({
      roles: ["manager"],
      requireCommunityScope: true,
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { ...member, roles: ["manager"] },
          params: {},
          query: { communityId: "other" },
        }),
      }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(
      /Community scope mismatch/,
    );
  });

  it("uses the first repeated communityId query value", () => {
    const guard = new ModuleAuthGuard({
      roles: ["manager"],
      requireCommunityScope: true,
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { ...member, roles: ["manager"] },
          params: {},
          query: { communityId: ["", "c1"] },
        }),
      }),
    };
    expect(guard.canActivate(context as never)).toBe(true);
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
