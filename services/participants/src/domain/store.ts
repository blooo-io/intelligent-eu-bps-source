import type {
  CommunitySettings,
  ParticipantRecord,
  TermsDocument,
} from "./types.js";
import {
  SEED_TERMS,
  seedCommunitySettings,
  seedParticipants,
} from "./seed.js";

/**
 * In-memory unit of work for AC-03 V1. PostgreSQL + transactional outbox
 * replace this store when CNPG wiring lands; the service API stays the same.
 */
export class ParticipantsStore {
  private communities = new Map<string, CommunitySettings>();
  private participants = new Map<string, ParticipantRecord>();
  private marketIndex = new Map<string, string>();
  private terms: TermsDocument = { ...SEED_TERMS };

  constructor() {
    this.reset();
  }

  reset(): void {
    this.communities.clear();
    this.participants.clear();
    this.marketIndex.clear();
    const community = seedCommunitySettings();
    this.communities.set(community.communityId, community);
    for (const row of seedParticipants()) {
      this.putParticipant(row);
    }
    this.terms = { ...SEED_TERMS };
  }

  getTerms(): TermsDocument {
    return { ...this.terms };
  }

  getCommunity(communityId: string): CommunitySettings | undefined {
    const row = this.communities.get(communityId);
    return row ? { ...row } : undefined;
  }

  putCommunity(settings: CommunitySettings): void {
    this.communities.set(settings.communityId, { ...settings });
  }

  getParticipant(participantId: string): ParticipantRecord | undefined {
    const row = this.participants.get(participantId);
    return row ? structuredClone(row) : undefined;
  }

  findByMarketActorId(marketId: string): ParticipantRecord | undefined {
    const id = this.marketIndex.get(marketId);
    return id ? this.getParticipant(id) : undefined;
  }

  listByCommunity(communityId: string): ParticipantRecord[] {
    return [...this.participants.values()]
      .filter((p) => p.communityId === communityId)
      .map((p) => structuredClone(p));
  }

  findByIdpSub(sub: string): ParticipantRecord | undefined {
    for (const row of this.participants.values()) {
      if (row.idpUserId === sub) {
        return structuredClone(row);
      }
    }
    return undefined;
  }

  putParticipant(row: ParticipantRecord): void {
    const previous = this.participants.get(row.participantId);
    if (previous?.marketActorId) {
      this.marketIndex.delete(previous.marketActorId);
    }
    this.participants.set(row.participantId, structuredClone(row));
    if (row.marketActorId && row.status !== "Offboarded") {
      this.marketIndex.set(row.marketActorId, row.participantId);
    }
  }
}
