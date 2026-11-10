/**
 * APISIX forwards validated claims for /v1/*; modules re-check via ModuleAuthGuard (REQ-010).
 * INT-287 / INT-342 — /internal/* requires a Keycloak service JWT in production
 * even when SERVICE_JWT_REQUIRED is unset. Header fallthrough is test-only.
 * INT-290 — `operator` is a user role; only `service` / token_use=service bypasses community scope.
 */
import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth.types.js";
import {
  resolveServiceJwtOptions,
  serviceJwtRequired,
  verifyServiceAccessToken,
} from "./service-jwt.js";

function applyHeaderPrincipal(req: Request): void {
  const authReq = req as AuthenticatedRequest;
  const roleHeader = req.header("x-intelligent-roles");
  if (!roleHeader) {
    return;
  }
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

function isInternalPath(req: Request): boolean {
  const raw = req.originalUrl || req.url || req.path || "";
  const path = raw.split("?")[0] ?? "";
  return path.startsWith("/internal");
}

export async function principalMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const internal = isInternalPath(req);
    const requireJwt = serviceJwtRequired();
    const jwtOpts = resolveServiceJwtOptions();
    const authHeader = (req.header("authorization") ?? "").trim();
    // Avoid /Bearer\s+(.+)$/ — Sonar S8786 (super-linear backtracking).
    const bearerParts = authHeader.split(/\s+/);
    const bearer =
      bearerParts.length === 2 && /^Bearer$/i.test(bearerParts[0] ?? "")
        ? bearerParts[1]
        : undefined;

    if (internal && requireJwt) {
      if (!jwtOpts) {
        res.status(503).json({ message: "service_jwt_not_configured" });
        return;
      }
      if (!bearer) {
        res.status(401).json({ message: "service_jwt_required" });
        return;
      }
      authReq.user = await verifyServiceAccessToken(bearer, jwtOpts);
      next();
      return;
    }

    // Dual-mode: prefer Bearer when present and JWKS is configured (cluster soft rollout).
    if (internal && bearer && jwtOpts) {
      try {
        authReq.user = await verifyServiceAccessToken(bearer, jwtOpts);
        next();
        return;
      } catch {
        // Fall through to headers for local/tests with opaque tokens.
      }
    }

    applyHeaderPrincipal(req);
    next();
  } catch {
    res.status(401).json({ message: "service_jwt_invalid" });
  }
}

/** Alias used by modules that historically named the middleware for service APIs. */
export const servicePrincipalMiddleware = principalMiddleware;
