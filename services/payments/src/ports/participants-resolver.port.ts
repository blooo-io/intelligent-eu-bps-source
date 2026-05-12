/**
 * INT-230 — resolve Keycloak IdP `sub` → AC-03 participantId.
 */

export type ResolvedParticipant = {
  participantId: string;
  communityId: string;
};

export type ParticipantsResolverPort = {
  resolveByIdpSub(idpUserId: string): Promise<ResolvedParticipant | null>;
};

export const PARTICIPANTS_RESOLVER = Symbol("PARTICIPANTS_RESOLVER");

/** No-op when PARTICIPANTS_INTERNAL_URL is unset (unit tests). */
export class NoopParticipantsResolver implements ParticipantsResolverPort {
  async resolveByIdpSub(): Promise<ResolvedParticipant | null> {
    return null;
  }
}

export class HttpParticipantsResolver implements ParticipantsResolverPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async resolveByIdpSub(
    idpUserId: string,
  ): Promise<ResolvedParticipant | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants:by-idp-sub/${idpUserId}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-07-payments",
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `participants resolveByIdpSub failed with ${res.status}`,
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

export function createParticipantsResolver(
  env: NodeJS.ProcessEnv = process.env,
): ParticipantsResolverPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpParticipantsResolver(base);
  }
  return new NoopParticipantsResolver();
}
