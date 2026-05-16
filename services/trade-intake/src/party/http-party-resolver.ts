import type { PartyResolverPort, ResolvedParty } from "./party-resolver.port.js";

/**
 * INT-237 — HTTP client of AC-03 ResolveParty.
 * Selected when PARTICIPANTS_INTERNAL_URL is set.
 */
export class HttpPartyResolver implements PartyResolverPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async resolve(marketActorId: string): Promise<ResolvedParty | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/parties:resolve`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-04-trade-intake",
      },
      body: JSON.stringify({ marketId: marketActorId }),
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `participants ResolveParty ${marketActorId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as {
      participantId?: string;
      communityId?: string;
    };
    if (
      typeof body.participantId !== "string" ||
      typeof body.communityId !== "string"
    ) {
      return null;
    }
    return {
      participantId: body.participantId,
      communityId: body.communityId,
    };
  }
}
