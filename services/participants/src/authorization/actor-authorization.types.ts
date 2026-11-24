import type { ParticipantRole } from "../domain/types.js";

/**
 * REQ-049 / REQ-052 — authorization view for EWDS command callers.
 * Unknown actors return status `unknown` with HTTP 200 (no id probing via 404).
 */
export type ActorAuthzStatus = "active" | "offboarded" | "unknown";

export type ActorMembershipRole = "member" | "manager" | "operator";

export type ActorMembership = {
  communityId: string;
  role: ActorMembershipRole;
  participantRole?: ParticipantRole;
};

export type ActorAuthorization = {
  actorId: string;
  status: ActorAuthzStatus;
  memberships: ActorMembership[];
};

/** Platform-scope community id for OPERATOR_ACTOR_IDS (not a real community). */
export const OPERATOR_SCOPE_COMMUNITY_ID =
  "00000000-0000-4000-8000-000000000099";
