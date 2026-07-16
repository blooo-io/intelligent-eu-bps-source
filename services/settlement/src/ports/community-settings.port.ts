import type { CommunityBillingContext } from "../domain/types.js";

/** Narrow client of AC-03 GetCommunitySettings (BR-05 / REQ-056). */
export interface CommunitySettingsPort {
  get(communityId: string): Promise<Omit<CommunityBillingContext, "communityId">>;
}

export const COMMUNITY_SETTINGS_PORT = Symbol("COMMUNITY_SETTINGS_PORT");

type SettingsDto = {
  currency?: string;
  threshold?: string | number;
  vatRate?: string | number;
  billingMode?: string;
};

/**
 * INT-272 — HTTP GetCommunitySettings against AC-03.
 * Selected when PARTICIPANTS_INTERNAL_URL is set (cluster).
 */
export class HttpCommunitySettings implements CommunitySettingsPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get(
    communityId: string,
  ): Promise<Omit<CommunityBillingContext, "communityId">> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/communities/${communityId}/settings`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-05-settlement",
      },
    });
    if (!res.ok) {
      throw new Error(
        `participants getCommunitySettings ${communityId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as SettingsDto;
    const currency = body.currency === "CHF" ? "CHF" : "EUR";
    const billingMode = body.billingMode === "live" ? "live" : "virtual";
    return {
      currency,
      threshold: Number(body.threshold ?? 5),
      vatRate: Number(body.vatRate ?? 0),
      billingMode,
    };
  }
}

export function createCommunitySettings(
  env: NodeJS.ProcessEnv = process.env,
): CommunitySettingsPort | null {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpCommunitySettings(base);
  }
  // Unit tests / local — SettlementService keeps fixture context.
  return null;
}
