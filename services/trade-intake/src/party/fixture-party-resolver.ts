import type { PartyResolverPort, ResolvedParty } from "./party-resolver.port.js";

/**
 * V1 test/fixture resolver: known actor UUIDs from AC-15 scenarios map 1:1
 * to participantId with a fixed community. Prefer HttpPartyResolver when
 * PARTICIPANTS_INTERNAL_URL is set (INT-237).
 */
export class FixturePartyResolver implements PartyResolverPort {
  constructor(
    private readonly communityId: string,
    private readonly knownActors: ReadonlySet<string>,
  ) {}

  async resolve(marketActorId: string): Promise<ResolvedParty | null> {
    if (!this.knownActors.has(marketActorId)) {
      return null;
    }
    return { participantId: marketActorId, communityId: this.communityId };
  }
}
