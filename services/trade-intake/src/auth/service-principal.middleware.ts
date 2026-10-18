import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "@intelligent/module-template";

/**
 * APISIX forwards validated claims; modules re-check via ModuleAuthGuard (REQ-010).
 * INT-290 — `operator` is a user role (community-scoped); only `service` / token_use=service bypass scope.
 * Tests inject the same shape via headers.
 */
export function servicePrincipalMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedRequest;
  const roleHeader = req.header("x-intelligent-roles");
  if (roleHeader) {
    const tokenUseHeader = req.header("x-intelligent-token-use");
    const roles = roleHeader.split(",").map((r) => r.trim()).filter(Boolean);
    const isService =
      tokenUseHeader === "service" || roles.includes("service");
    authReq.user = {
      sub: req.header("x-intelligent-sub") ?? (isService ? "service-account" : ""),
      roles,
      communityId: req.header("x-intelligent-community") ?? "",
      tokenUse: isService ? "service" : "user",
    };
  }
  next();
}
