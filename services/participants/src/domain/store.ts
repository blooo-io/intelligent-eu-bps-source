import type {
  CommunitySettings,
  ParticipantRecord,
  TermsDocument,
} from "./types.js";
import {
  SEED_TERMS,
  seedCommunitySettings,
  seedParticipants,
  seedS1CommunitySettings,
} from "./seed.js";

export type ParticipantWrite =
  | { kind: "participant"; row: ParticipantRecord }
  | { kind: "community"; row: CommunitySettings };

/**
 * AC-03 registry. INT-356 — mutations are recorded and committed with the
 * outbox when DATABASE_URL is set. The service API stays the same.
 */
export class ParticipantsStore {
  private readonly communities = new Map<string, CommunitySettings>();
  private readonly participants = new Map<string, ParticipantRecord>();
  private readonly marketIndex = new Map<string, string>();
  private terms: TermsDocument = { ...SEED_TERMS };
  private recording = false;
  private writes: ParticipantWrite[] = [];

  beginRecording(): void {
    this.recording = true;
    this.writes = [];
  }

  takeRecording(): ParticipantWrite[] {
    this.recording = false;
    return this.writes.splice(0);
  }

  stopRecording(): void {
    this.recording = false;
    this.writes = [];
  }

  snapshot(): string {
    return JSON.stringify({
      communities: [...this.communities.values()],
      participants: [...this.participants.values()],
      terms: this.terms,
    });
  }

  restore(snapshot: string): void {
    const data = JSON.parse(snapshot) as {
      communities: CommunitySettings[];
      participants: ParticipantRecord[];
      terms: TermsDocument;
    };
    const recording = this.recording;
    this.recording = false;
    this.communities.clear();
    this.participants.clear();
    this.marketIndex.clear();
    for (const row of data.communities) this.putCommunity(row);
    for (const row of data.participants) this.putParticipant(row);
    this.terms = { ...data.terms };
    this.recording = recording;
  }

  constructor() {
    this.reset();
  }

  reset(): void {
    this.communities.clear();
    this.participants.clear();
    this.marketIndex.clear();
    const community = seedCommunitySettings();
    this.communities.set(community.communityId, community);
    // INT-230 — S1 fixture community alongside UAT seed.
    const s1 = seedS1CommunitySettings();
    this.communities.set(s1.communityId, s1);
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
    if (this.recording) this.writes.push({ kind: "community", row: { ...settings } });
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
    if (this.recording) this.writes.push({ kind: "participant", row: structuredClone(row) });
    if (row.marketActorId && row.status !== "Offboarded") {
      this.marketIndex.set(row.marketActorId, row.participantId);
    }
  }
}
