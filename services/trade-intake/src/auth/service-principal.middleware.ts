import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "@intelligent/module-template";

/** V1 internal calls — APISIX forwards validated service claims (REQ-010). */
export function servicePrincipalMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedRequest;
  const roleHeader = req.header("x-intelligent-roles");
  if (roleHeader) {
    authReq.user = {
      sub: req.header("x-intelligent-sub") ?? "service-account",
      roles: roleHeader.split(",").map((r) => r.trim()).filter(Boolean),
      communityId: req.header("x-intelligent-community") ?? "",
      tokenUse: "service",
    };
  }
  next();
}
