/** Narrow client of AC-03 ResolveParty for attribution during intake. */

export type ResolvedParty = {
  participantId: string;
  communityId: string;
};

export interface PartyResolverPort {
  resolve(marketActorId: string): Promise<ResolvedParty | null>;
}

export const PARTY_RESOLVER = Symbol("PARTY_RESOLVER");
