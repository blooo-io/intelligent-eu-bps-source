import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OutboxService } from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import {
  OPERATOR_SCOPE_COMMUNITY_ID,
  type ActorAuthorization,
  type ActorMembership,
} from "./actor-authorization.types.js";
import { CommunityManagersStore } from "./community-managers.store.js";

const PRODUCER = "AC-03";

/**
 * REQ-049 / REQ-010 / REQ-030 — resolve actor authorization for EWDS callers
 * and bind community managers (operator-only).
 */
@Injectable()
export class ActorAuthorizationService {
  constructor(
    @Inject(ParticipantsStore) private readonly store: ParticipantsStore,
    @Inject(CommunityManagersStore)
    private readonly managers: CommunityManagersStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  /**
   * REQ-049 — members from ParticipantRecord; managers from community_manager;
   * operators from OPERATOR_ACTOR_IDS. Unknown → status unknown (HTTP 200).
   */
  async authorize(actorId: string): Promise<ActorAuthorization> {
    const memberships: ActorMembership[] = [];
    const operatorIds = parseOperatorIds(process.env.OPERATOR_ACTOR_IDS);

    if (operatorIds.has(actorId)) {
      memberships.push({
        communityId: OPERATOR_SCOPE_COMMUNITY_ID,
        role: "operator",
      });
    }

    for (const binding of this.managers.listByActor(actorId)) {
      memberships.push({
        communityId: binding.communityId,
        role: "manager",
      });
    }

    const participant = this.store.getParticipant(actorId);
    if (participant && participant.status !== "Offboarded") {
      memberships.push({
        communityId: participant.communityId,
        role: "member",
        participantRole: participant.role,
      });
    }

    if (memberships.length > 0) {
      return { actorId, status: "active", memberships };
    }

    if (participant?.status === "Offboarded") {
      return { actorId, status: "offboarded", memberships: [] };
    }

    return { actorId, status: "unknown", memberships: [] };
  }

  /**
   * REQ-010 / REQ-030 — bind a manager actor to a community; audit only ids.
   */
  async bindManager(
    communityId: string,
    actorId: string,
    by: string,
  ): Promise<void> {
    const community = this.store.getCommunity(communityId);
    if (!community) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    const boundAt = new Date().toISOString();
    this.managers.bind({ actorId, communityId, boundAt, boundBy: by });

    await this.outbox.append({
      aggregateType: "CommunityManager",
      aggregateId: `${communityId}:${actorId}`,
      type: "AuditableActionPerformed",
      producer: PRODUCER,
      communityId,
      billingMode: community.billingMode,
      data: {
        actorId: by,
        action: "community.manager.bind",
        target: `actor:${actorId}`,
        timestamp: boundAt,
      },
    });
  }
}

export function parseOperatorIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
