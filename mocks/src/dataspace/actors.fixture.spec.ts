import { describe, expect, it } from "vitest";
import {
  ACTOR_FIXTURE_COMMUNITY_ID,
  ewdsActorFixtures,
} from "./actors.fixture.js";

describe("ewdsActorFixtures (REQ-008 / UAT-008)", () => {
  it("returns three actors for the seed community", () => {
    const actors = ewdsActorFixtures();
    expect(actors).toHaveLength(3);
    expect(actors.every((a) => a.communityId === ACTOR_FIXTURE_COMMUNITY_ID)).toBe(
      true,
    );
    expect(new Set(actors.map((a) => a.actorId)).size).toBe(3);
    expect(actors.every((a) => a.version === "1")).toBe(true);
  });
});
