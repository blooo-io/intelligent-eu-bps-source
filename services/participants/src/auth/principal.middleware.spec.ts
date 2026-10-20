import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import {
  principalMiddleware,
  type AuthenticatedRequest,
} from "@intelligent/module-template";

describe("principalMiddleware (INT-290)", () => {
  it("treats service role as service tokenUse", async () => {
    const req = {
      header: (name: string) =>
        ({
          "x-intelligent-roles": "service",
          "x-intelligent-sub": "svc-1",
        })[name],
      originalUrl: "/v1/me",
      url: "/v1/me",
      path: "/v1/me",
    } as Request;
    const authReq = req as AuthenticatedRequest;
    await new Promise<void>((resolve) => {
      void principalMiddleware(req, {} as Response, () => resolve());
    });
    expect(authReq.user?.tokenUse).toBe("service");
  });

  it("treats operator as user tokenUse (no community bypass)", async () => {
    const req = {
      header: (name: string) =>
        ({
          "x-intelligent-roles": "operator",
          "x-intelligent-sub": "op-1",
          "x-intelligent-community": "c1",
        })[name],
      originalUrl: "/v1/jobs",
      url: "/v1/jobs",
      path: "/v1/jobs",
    } as Request;
    const authReq = req as AuthenticatedRequest;
    await new Promise<void>((resolve) => {
      void principalMiddleware(req, {} as Response, () => resolve());
    });
    expect(authReq.user?.tokenUse).toBe("user");
    expect(authReq.user?.roles).toContain("operator");
  });
});
