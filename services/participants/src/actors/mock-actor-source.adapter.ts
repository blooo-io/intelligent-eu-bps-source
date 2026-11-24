import { ewdsActorFixtures } from "@intelligent/mocks";
import type { ActorRecord, ActorSourcePort } from "./actor-source.port.js";

/**
 * REQ-008 — mock P-ACTOR-SRC. Returns AC-15 Actor fixtures (UAT-008).
 * Override via constructor for unit tests.
 */
export class MockActorSourceAdapter implements ActorSourcePort {
  constructor(private readonly actors: ActorRecord[] = defaultActors()) {}

  async listActors(communityId: string): Promise<ActorRecord[]> {
    return this.actors
      .filter((a) => a.communityId === communityId)
      .map((a) => structuredClone(a));
  }
}

function defaultActors(): ActorRecord[] {
  return ewdsActorFixtures().map((f) => ({
    actorId: f.actorId,
    communityId: f.communityId,
    gsyActorId: f.gsyActorId,
    meterId: f.meterId,
    role: f.role,
    name: f.name,
    address: { ...f.address },
    contact: { ...f.contact },
    version: f.version,
  }));
}
