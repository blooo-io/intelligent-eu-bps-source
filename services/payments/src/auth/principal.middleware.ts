import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "@intelligent/module-template";

export function principalMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedRequest;
  const roleHeader = req.header("x-intelligent-roles");
  if (roleHeader) {
    const roles = roleHeader.split(",").map((r) => r.trim()).filter(Boolean);
    authReq.user = {
      sub: req.header("x-intelligent-sub") ?? "",
      roles,
      communityId: req.header("x-intelligent-community") ?? "",
      // Webhooks and probes omit roles; member/manager are user tokens (REQ-010).
      tokenUse: roles.includes("service") || roles.includes("operator")
        ? "service"
        : "user",
    };
  }
  next();
}
