import type { ContactDetails, ParticipantRole, PostalAddress } from "../domain/types.js";

/**
 * REQ-008 / REQ-058 — Actor record from P-ACTOR-SRC (EWDS or mock).
 * participantId = actorId when ingested.
 */
export type ActorRecord = {
  actorId: string;
  communityId: string;
  gsyActorId: string;
  meterId: string;
  role: ParticipantRole;
  name: string;
  address: PostalAddress;
  contact: ContactDetails;
  version: string;
};

export interface ActorSourcePort {
  listActors(communityId: string): Promise<ActorRecord[]>;
}

export const ACTOR_SOURCE_PORT = Symbol("ACTOR_SOURCE_PORT");
