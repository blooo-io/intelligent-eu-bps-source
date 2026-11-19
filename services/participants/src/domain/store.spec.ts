import { describe, expect, it } from "vitest";
import { ParticipantsStore } from "./store.js";
import { SEED_COMMUNITY_ID } from "./seed.js";
import type { ParticipantRecord } from "./types.js";

describe("ParticipantsStore (INT-356)", () => {
  it("records writes during a transaction batch", () => {
    const store = new ParticipantsStore();
    const community = store.getCommunity(SEED_COMMUNITY_ID)!;
    store.beginRecording();
    store.putCommunity({ ...community, threshold: "6.00" });
    const writes = store.takeRecording();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.kind).toBe("community");
    expect(store.takeRecording()).toEqual([]);
  });

  it("stopRecording clears pending writes without returning them", () => {
    const store = new ParticipantsStore();
    store.beginRecording();
    const row = store.getParticipant(
      "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
    )!;
    store.putParticipant({ ...row, meterId: "meter-x" });
    store.stopRecording();
    expect(store.takeRecording()).toEqual([]);
  });

  it("snapshot and restore round-trips registry state", () => {
    const store = new ParticipantsStore();
    const community = store.getCommunity(SEED_COMMUNITY_ID)!;
    const snap = store.snapshot();
    store.putCommunity({ ...community, threshold: "9.99" });
    expect(store.getCommunity(SEED_COMMUNITY_ID)?.threshold).toBe("9.99");
    store.restore(snap);
    expect(store.getCommunity(SEED_COMMUNITY_ID)?.threshold).toBe(community.threshold);
  });

  it("restore preserves recording flag", () => {
    const store = new ParticipantsStore();
    store.beginRecording();
    const snap = store.snapshot();
    store.putParticipant({
      ...store.getParticipant("f69e6745-3bfe-49ad-b84e-0853aa86ad05")!,
      meterId: "recorded",
    });
    store.restore(snap);
    expect(store.takeRecording()).toHaveLength(1);
  });

  it("maintains market index when marketActorId changes or participant offboards", () => {
    const store = new ParticipantsStore();
    const template = store.getParticipant(
      "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
    )!;
    const base: ParticipantRecord = {
      ...template,
      participantId: "p-index",
      marketActorId: "actor-a",
      meterId: "m1",
      idpUserId: "sub-1",
    };
    store.putParticipant(base);
    expect(store.findByMarketActorId("actor-a")?.participantId).toBe("p-index");

    store.putParticipant({ ...base, marketActorId: "actor-b" });
    expect(store.findByMarketActorId("actor-a")).toBeUndefined();
    expect(store.findByMarketActorId("actor-b")?.participantId).toBe("p-index");

    store.putParticipant({ ...base, marketActorId: "actor-b", status: "Offboarded" });
    expect(store.findByMarketActorId("actor-b")).toBeUndefined();
  });
});