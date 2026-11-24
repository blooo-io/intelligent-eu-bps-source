/**
 * REQ-043 / UAT-054 — AC-07 PSP capabilities (live keys present?).
 *
 * Used when switching a community virtual → live. When PAYMENTS_INTERNAL_URL
 * is unset, NoLivePspCapabilities refuses live (fail closed for local/tests
 * unless a stub is injected).
 */
import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";

export type PspCapabilities = {
  provider: "stripe" | "mock";
  testConfigured: boolean;
  liveConfigured: boolean;
};

export interface PspCapabilitiesPort {
  get(): Promise<PspCapabilities>;
}

export const PSP_CAPABILITIES_PORT = Symbol("PSP_CAPABILITIES_PORT");

/** Local / CI default — live keys are never present. */
export class NoLivePspCapabilities implements PspCapabilitiesPort {
  async get(): Promise<PspCapabilities> {
    return {
      provider: "mock",
      testConfigured: true,
      liveConfigured: false,
    };
  }
}

/** HTTP client of AC-07 `GET /internal/v1/psp/capabilities`. */
export class HttpPspCapabilities implements PspCapabilitiesPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async get(): Promise<PspCapabilities> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/psp/capabilities`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-03-participants", this.auth)),
      },
    });
    if (!res.ok) {
      throw new Error(`payments psp/capabilities failed with ${res.status}`);
    }
    const body = (await res.json()) as {
      provider?: string;
      testConfigured?: boolean;
      liveConfigured?: boolean;
    };
    return {
      provider: body.provider === "stripe" ? "stripe" : "mock",
      testConfigured: body.testConfigured === true,
      liveConfigured: body.liveConfigured === true,
    };
  }
}

export function createPspCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): PspCapabilitiesPort {
  const base = env.PAYMENTS_INTERNAL_URL;
  if (base) {
    return new HttpPspCapabilities(base);
  }
  return new NoLivePspCapabilities();
}
