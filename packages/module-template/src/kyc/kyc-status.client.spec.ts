/**
 * REQ-045 — manager KYC gate and HTTP client fail-closed behaviour.
 */
import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  AllowAllKycStatusClient,
  createKycStatusClient,
  HttpKycStatusClient,
  RequireVerifiedKycGuard,
  type KycStatusClient,
} from "./kyc-status.client.js";

function ctxFor(user: AuthenticatedRequest["user"]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }) as AuthenticatedRequest,
    }),
  } as ExecutionContext;
}

describe("RequireVerifiedKycGuard / KycStatusClient (REQ-045)", () => {
  it("REQ-045: manager without KYC cannot trigger financial actions", async () => {
    const client: KycStatusClient = {
      statusOf: async () => ({ kycVerified: false, kycStatus: "pending" }),
    };
    const guard = new RequireVerifiedKycGuard(client);
    await expect(
      guard.canActivate(
        ctxFor({
          sub: "m-1",
          roles: ["manager"],
          communityId: "c-1",
          tokenUse: "user",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("operator and service bypass manager KYC", async () => {
    const client: KycStatusClient = {
      statusOf: vi.fn(async () => ({ kycVerified: false, kycStatus: "none" })),
    };
    const guard = new RequireVerifiedKycGuard(client);
    await expect(
      guard.canActivate(
        ctxFor({
          sub: "op-1",
          roles: ["operator"],
          communityId: "c-1",
          tokenUse: "user",
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        ctxFor({
          sub: "svc-1",
          roles: ["service"],
          communityId: "c-1",
          tokenUse: "service",
        }),
      ),
    ).resolves.toBe(true);
    expect(client.statusOf).not.toHaveBeenCalled();
  });

  it("HTTP client fails closed on 5xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("err", { status: 503 }));
    const client = new HttpKycStatusClient(
      "http://payments.invalid",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(client.statusOf("m-1")).rejects.toThrow(/failed with 503/);
  });

  it("createKycStatusClient uses AllowAll when URL unset", () => {
    const client = createKycStatusClient({});
    expect(client).toBeInstanceOf(AllowAllKycStatusClient);
  });

  it("REQ-045: AllowAll client refused when NODE_ENV=production", () => {
    expect(() =>
      createKycStatusClient({ NODE_ENV: "production" }),
    ).toThrow(/PAYMENTS_INTERNAL_URL is required when NODE_ENV=production/);
  });

  it("createKycStatusClient uses HTTP in production when URL is set", () => {
    const client = createKycStatusClient({
      NODE_ENV: "production",
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
    });
    expect(client).toBeInstanceOf(HttpKycStatusClient);
  });

  it("verified manager is allowed", async () => {
    const guard = new RequireVerifiedKycGuard({
      statusOf: async () => ({ kycVerified: true, kycStatus: "verified" }),
    });
    await expect(
      guard.canActivate(
        ctxFor({
          sub: "m-1",
          roles: ["manager"],
          communityId: "c-1",
          tokenUse: "user",
        }),
      ),
    ).resolves.toBe(true);
  });
});
