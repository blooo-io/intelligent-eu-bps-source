/**
 * REQ-043 / INT-440 — AC-05 open-period probe used before virtual→live.
 * When SETTLEMENT_INTERNAL_URL is unset, returns [] so local tests can switch.
 */
export type OpenPeriods = {
  communityId: string;
  periods: string[];
};

export interface OpenPeriodsPort {
  list(communityId: string): Promise<OpenPeriods>;
}

export const OPEN_PERIODS_PORT = Symbol("OPEN_PERIODS_PORT");

/** Local/CI default — no open periods (fail open for unit tests). */
export class EmptyOpenPeriods implements OpenPeriodsPort {
  async list(communityId: string): Promise<OpenPeriods> {
    return { communityId, periods: [] };
  }
}

export class HttpOpenPeriods implements OpenPeriodsPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async list(communityId: string): Promise<OpenPeriods> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/communities/${communityId}/open-periods`;
    const res = await this.fetchImpl(url, {
      headers: { "x-intelligent-roles": "service" },
    });
    if (!res.ok) {
      throw new Error(`open-periods ${res.status}`);
    }
    const body = (await res.json()) as OpenPeriods;
    return {
      communityId: body.communityId ?? communityId,
      periods: Array.isArray(body.periods) ? body.periods.map(String) : [],
    };
  }
}

export function createOpenPeriods(
  env: NodeJS.ProcessEnv = process.env,
): OpenPeriodsPort {
  const base = env.SETTLEMENT_INTERNAL_URL?.trim();
  if (base) return new HttpOpenPeriods(base);
  return new EmptyOpenPeriods();
}
