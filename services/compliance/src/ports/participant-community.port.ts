import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";

/**
 * AC-03 community of a participant (INT-336 / REQ-013 / REQ-049).
 * AC-12 uses it so a manager or DPO cannot name a participant of another community.
 * INT-375 — a member's own request is keyed by the registry participant, resolved
 * from the IdP `sub` (INT-230). The subject is not the participant id.
 */
export type ResolvedParticipant = {
  participantId: string;
  communityId: string;
};

export type ParticipantCommunityPort = {
  communityOf(participantId: string): Promise<string | null>;
  resolveByIdpSub(idpUserId: string): Promise<ResolvedParticipant | null>;
};

export const PARTICIPANT_COMMUNITY = Symbol("PARTICIPANT_COMMUNITY");

/** No directory — callers fall back to the local personal-data projection. */
export class NoopParticipantCommunity implements ParticipantCommunityPort {
  async communityOf(): Promise<string | null> {
    return null;
  }

  async resolveByIdpSub(): Promise<ResolvedParticipant | null> {
    return null;
  }
}

export class HttpParticipantCommunity implements ParticipantCommunityPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async communityOf(participantId: string): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants/${participantId}/community`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-12-compliance", this.auth)),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(
        `participants communityOf failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as { communityId?: string };
    return typeof body.communityId === "string" && body.communityId
      ? body.communityId
      : null;
  }

  async resolveByIdpSub(idpUserId: string): Promise<ResolvedParticipant | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants:by-idp-sub/${encodeURIComponent(idpUserId)}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-12-compliance", this.auth)),
      },
    });
    if (res.status === 404) return null;
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
    return { participantId: body.participantId, communityId: body.communityId };
  }
}

export function createParticipantCommunity(
  env: NodeJS.ProcessEnv = process.env,
): ParticipantCommunityPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) return new HttpParticipantCommunity(base);
  return new NoopParticipantCommunity();
}
