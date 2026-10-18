import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { principalMiddleware } from "./principal.middleware.js";
import type { AuthenticatedRequest } from "@intelligent/module-template";

function run(
  headers: Record<string, string | undefined>,
): AuthenticatedRequest {
  const req = {
    header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
  } as Request;
  const authReq = req as AuthenticatedRequest;
  principalMiddleware(req, {} as Response, () => undefined);
  return authReq;
}

describe("principalMiddleware (INT-290)", () => {
  it("treats service role as service tokenUse", () => {
    const req = run({
      "x-intelligent-roles": "service",
      "x-intelligent-sub": "svc-1",
    });
    expect(req.user?.tokenUse).toBe("service");
  });

  it("treats operator as user tokenUse (no community bypass)", () => {
    const req = run({
      "x-intelligent-roles": "operator",
      "x-intelligent-sub": "op-1",
      "x-intelligent-community": "c1",
    });
    expect(req.user?.tokenUse).toBe("user");
    expect(req.user?.roles).toContain("operator");
  });

  it("honours x-intelligent-token-use=service", () => {
    const req = run({
      "x-intelligent-roles": "operator",
      "x-intelligent-token-use": "service",
      "x-intelligent-sub": "svc-op",
    });
    expect(req.user?.tokenUse).toBe("service");
  });
});
