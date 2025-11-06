import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "@intelligent/module-template";

/**
 * APISIX forwards validated claims; modules re-check via ModuleAuthGuard (REQ-010).
 * Tests inject the same shape via headers.
 */
export function principalMiddleware(
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
      tokenUseHeader === "service" ||
      roles.includes("service") ||
      roles.includes("operator");
    authReq.user = {
      sub: req.header("x-intelligent-sub") ?? (isService ? "service-account" : ""),
      roles,
      communityId: req.header("x-intelligent-community") ?? "",
      tokenUse: isService ? "service" : "user",
    };
  }
  next();
}
