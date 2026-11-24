/**
 * REQ-043 / UAT-054 / A10.1 — per-community billing mode (live | virtual).
 *
 * When PARTICIPANTS_INTERNAL_URL is set, resolves via AC-03
 * `GET /internal/v1/communities/{id}/settings` with a 30 s TTL cache.
 * Fail closed: HTTP errors throw (never silently assume virtual in prod).
 * When unset, StaticBillingModeResolver("virtual") for tests/local.
 */
import { Logger } from "@nestjs/common";
import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "../auth/service-auth-headers.js";

export type BillingMode = "live" | "virtual";

export interface BillingModeResolver {
  modeOf(communityId: string): Promise<BillingMode>;
}

export const BILLING_MODE_RESOLVER = Symbol("BILLING_MODE_RESOLVER");

const CACHE_TTL_MS = 30_000;

/** Tests/local default when PARTICIPANTS_INTERNAL_URL is unset. */
export class StaticBillingModeResolver implements BillingModeResolver {
  constructor(private readonly mode: BillingMode = "virtual") {}

  async modeOf(_communityId: string): Promise<BillingMode> {
    return this.mode;
  }
}

type CacheEntry = { mode: BillingMode; expiresAt: number };

/**
 * HTTP resolver — caches successful responses for 30 s.
 * Unknown `billingMode` values map to `"virtual"`.
 * Non-OK responses throw (fail closed).
 */
export class HttpBillingModeResolver implements BillingModeResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly logger = new Logger(HttpBillingModeResolver.name);

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async modeOf(communityId: string): Promise<BillingMode> {
    const hit = this.cache.get(communityId);
    const t = this.now();
    if (hit && hit.expiresAt > t) {
      return hit.mode;
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/communities/${communityId}/settings`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("billing-mode-resolver", this.auth)),
      },
    });
    if (!res.ok) {
      // Fail closed — do not invent a mode on upstream failure (REQ-043).
      throw new Error(`billing-mode ${communityId} failed with ${res.status}`);
    }
    const body = (await res.json()) as { billingMode?: unknown };
    const mode: BillingMode = body.billingMode === "live" ? "live" : "virtual";
    if (body.billingMode !== "live" && body.billingMode !== "virtual") {
      this.logger.warn(
        `Unknown billingMode for communityId=${communityId}; mapping to virtual`,
      );
    }
    this.cache.set(communityId, { mode, expiresAt: t + CACHE_TTL_MS });
    return mode;
  }
}

export function createBillingModeResolver(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): BillingModeResolver {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpBillingModeResolver(base, fetchImpl);
  }
  return new StaticBillingModeResolver("virtual");
}
