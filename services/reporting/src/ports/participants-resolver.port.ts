import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";

/**
 * INT-373 — resolve Keycloak IdP `sub` → AC-03 participantId. The registry id is
 * not the IdP subject (INT-230), so a member's own history is bound through AC-03.
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
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async resolveByIdpSub(idpUserId: string): Promise<ResolvedParticipant | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants:by-idp-sub/${encodeURIComponent(idpUserId)}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-09-reporting", this.auth)),
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`participants resolveByIdpSub failed with ${res.status}`);
    }
    const body = (await res.json()) as {
      participantId?: string;
      communityId?: string;
    };
    if (typeof body.participantId !== "string" || typeof body.communityId !== "string") {
      return null;
    }
    return { participantId: body.participantId, communityId: body.communityId };
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
