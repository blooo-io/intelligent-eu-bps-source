/**
 * INT-463 — participant identity on the product path is `actorId` / participantId.
 * Legacy Keycloak `sub` → participant bridge (`by-idp-sub`) removed.
 */

export type ResolvedParticipant = {
  participantId: string;
  communityId: string;
};

export type ParticipantsResolverPort = {
  /** @deprecated INT-463 — always null; callers must use participantId. */
  resolveByIdpSub(idpUserId: string): Promise<ResolvedParticipant | null>;
};

export const PARTICIPANTS_RESOLVER = Symbol("PARTICIPANTS_RESOLVER");

export class NoopParticipantsResolver implements ParticipantsResolverPort {
  async resolveByIdpSub(): Promise<ResolvedParticipant | null> {
    return null;
  }
}

export function createParticipantsResolver(
  _env: NodeJS.ProcessEnv = process.env,
): ParticipantsResolverPort {
  return new NoopParticipantsResolver();
}
