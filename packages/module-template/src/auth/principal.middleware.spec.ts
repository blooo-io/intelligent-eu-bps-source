import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { principalMiddleware } from "./principal.middleware.js";
import type { AuthenticatedRequest } from "./auth.types.js";
import { resetServiceJwtJwksCache } from "./service-jwt.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("principalMiddleware (INT-287)", () => {
  afterEach(() => {
    resetServiceJwtJwksCache();
    delete process.env.SERVICE_JWT_REQUIRED;
    delete process.env.KEYCLOAK_BASE_URL;
    delete process.env.KEYCLOAK_REALM;
  });

  it("accepts forgeable headers on /internal when SERVICE_JWT_REQUIRED is off", async () => {
    const req = {
      originalUrl: "/internal/v1/ping",
      header(name: string) {
        const h: Record<string, string> = {
          "x-intelligent-roles": "service",
          "x-intelligent-sub": "ac-05",
          "x-intelligent-token-use": "service",
        };
        return h[name.toLowerCase()];
      },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await principalMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as AuthenticatedRequest).user?.roles).toContain("service");
  });

  it("rejects /internal without Bearer when SERVICE_JWT_REQUIRED=true", async () => {
    process.env.SERVICE_JWT_REQUIRED = "true";
    process.env.KEYCLOAK_BASE_URL = "http://keycloak";
    process.env.KEYCLOAK_REALM = "int";
    const req = {
      originalUrl: "/internal/v1/ping",
      header() {
        return undefined;
      },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await principalMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
