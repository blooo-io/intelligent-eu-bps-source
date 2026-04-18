import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "@intelligent/module-template";

/**
 * APISIX forwards validated claims (REQ-010).
 * INT-218 — operator public routes need user/service tokenUse like reconciliation.
 */
export function servicePrincipalMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedRequest;
  const roleHeader = req.header("x-intelligent-roles");
  if (roleHeader) {
    const roles = roleHeader.split(",").map((r) => r.trim()).filter(Boolean);
    authReq.user = {
      sub: req.header("x-intelligent-sub") ?? "service-account",
      roles,
      communityId: req.header("x-intelligent-community") ?? "",
      tokenUse:
        roles.includes("service") || roles.includes("operator")
          ? "service"
          : "user",
    };
  }
  next();
}
