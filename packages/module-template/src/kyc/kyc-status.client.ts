/**
 * REQ-045 / UAT-056 — shared KYC status client and manager financial-action gate.
 *
 * Queries AC-07 `GET /internal/v1/kyc-status/{subjectId}`. When
 * PAYMENTS_INTERNAL_URL is unset, uses AllowAllKycStatusClient (test-only).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "../auth/service-auth-headers.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";

export const KYC_STATUS_CLIENT = Symbol("KYC_STATUS_CLIENT");

export type KycStatusSnapshot = {
  kycVerified: boolean;
  kycStatus: string;
};

export interface KycStatusClient {
  statusOf(subjectId: string): Promise<KycStatusSnapshot>;
}

/**
 * Test-only / local default when PAYMENTS_INTERNAL_URL is unset.
 * Logs a warning at construction — never treat a missing status as verified
 * in production (use the HTTP client instead).
 */
export class AllowAllKycStatusClient implements KycStatusClient {
  private static warned = false;

  constructor() {
    if (!AllowAllKycStatusClient.warned) {
      AllowAllKycStatusClient.warned = true;
      Logger.warn(
        "AllowAllKycStatusClient active (PAYMENTS_INTERNAL_URL unset) — test-only",
        "KycStatusClient",
      );
    }
  }

  async statusOf(_subjectId: string): Promise<KycStatusSnapshot> {
    return { kycVerified: true, kycStatus: "verified" };
  }
}

export class HttpKycStatusClient implements KycStatusClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async statusOf(subjectId: string): Promise<KycStatusSnapshot> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/kyc-status/${subjectId}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("kyc-status-client", this.auth)),
      },
    });
    if (!res.ok) {
      // Fail closed — a missing / errored status is never treated as verified.
      throw new Error(`kyc-status ${subjectId} failed with ${res.status}`);
    }
    const body = (await res.json()) as {
      kycVerified?: boolean;
      kycStatus?: string;
    };
    return {
      kycVerified: body.kycVerified === true,
      kycStatus: typeof body.kycStatus === "string" ? body.kycStatus : "none",
    };
  }
}

export function createKycStatusClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): KycStatusClient {
  const base = env.PAYMENTS_INTERNAL_URL;
  if (base) {
    return new HttpKycStatusClient(base, fetchImpl);
  }
  return new AllowAllKycStatusClient();
}

/**
 * REQ-045 — managers must have verified KYC before financial actions.
 * Operators and service accounts bypass the check.
 */
@Injectable()
export class RequireVerifiedKycGuard implements CanActivate {
  constructor(
    @Inject(KYC_STATUS_CLIENT) private readonly kyc: KycStatusClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException({
        code: "kyc_not_verified",
        subject: "manager",
      });
    }
    // Operator / service bypass manager KYC (desk / automation).
    if (
      user.tokenUse === "service" ||
      user.roles.includes("operator") ||
      user.roles.includes("service")
    ) {
      return true;
    }
    if (!user.roles.includes("manager")) {
      return true;
    }
    const status = await this.kyc.statusOf(user.sub);
    if (!status.kycVerified) {
      throw new ForbiddenException({
        code: "kyc_not_verified",
        subject: "manager",
      });
    }
    return true;
  }
}
