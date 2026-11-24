/**
 * REQ-049 / REQ-010 — community_manager bindings (actor_id, community_id).
 * In-memory registry; optional SQL hydrate via participant-journal SCHEMA.
 */
export type CommunityManagerBinding = {
  actorId: string;
  communityId: string;
  boundAt: string;
  boundBy: string;
};

export class CommunityManagersStore {
  private readonly byKey = new Map<string, CommunityManagerBinding>();

  private key(communityId: string, actorId: string): string {
    return `${communityId}:${actorId}`;
  }

  reset(): void {
    this.byKey.clear();
  }

  bind(binding: CommunityManagerBinding): void {
    this.byKey.set(this.key(binding.communityId, binding.actorId), {
      ...binding,
    });
  }

  isManager(communityId: string, actorId: string): boolean {
    return this.byKey.has(this.key(communityId, actorId));
  }

  listByActor(actorId: string): CommunityManagerBinding[] {
    return [...this.byKey.values()]
      .filter((b) => b.actorId === actorId)
      .map((b) => ({ ...b }));
  }

  listAll(): CommunityManagerBinding[] {
    return [...this.byKey.values()].map((b) => ({ ...b }));
  }

  restore(rows: CommunityManagerBinding[]): void {
    this.byKey.clear();
    for (const row of rows) this.bind(row);
  }
}
