import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";

/** The AC-03 community settings AC-07 reads (REQ-015). */
export type PayoutSettings = { autoPayout: boolean };

/** Narrow client of AC-03 GetCommunitySettings. */
export interface CommunitySettingsPort {
  get(communityId: string): Promise<PayoutSettings>;
}

export const COMMUNITY_SETTINGS = Symbol("COMMUNITY_SETTINGS");

/** In-memory stub for unit tests and local runs without AC-03; automatic payouts are off by default. */
export class InMemoryCommunitySettings implements CommunitySettingsPort {
  private readonly rows = new Map<string, PayoutSettings>();

  put(communityId: string, settings: PayoutSettings): void {
    this.rows.set(communityId, { ...settings });
  }

  reset(): void {
    this.rows.clear();
  }

  async get(communityId: string): Promise<PayoutSettings> {
    return { autoPayout: this.rows.get(communityId)?.autoPayout ?? false };
  }
}

export class HttpCommunitySettings implements CommunitySettingsPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async get(communityId: string): Promise<PayoutSettings> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/communities/${communityId}/settings`;
    const res = await this.fetchImpl(url, {
      headers: { ...(await resolveServiceAuthHeaders("ac-07-payments", this.auth)) },
    });
    if (!res.ok) {
      throw new Error(`participants getCommunitySettings failed with ${res.status}`);
    }
    const body = (await res.json()) as { autoPayout?: unknown };
    return { autoPayout: body.autoPayout === true };
  }
}

export function createCommunitySettings(
  env: NodeJS.ProcessEnv,
  memory: InMemoryCommunitySettings,
): CommunitySettingsPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  return base ? new HttpCommunitySettings(base) : memory;
}
