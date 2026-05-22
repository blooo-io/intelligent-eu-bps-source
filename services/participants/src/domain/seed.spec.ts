import { describe, expect, it } from "vitest";
import { ParticipantsStore } from "./store.js";
import {
  S1_COMMUNITY_ID,
  S1_CONSUMER_ID,
  S1_CONSUMER_IDP_USER_ID,
  S1_MANAGER_ID,
  S1_MANAGER_IDP_USER_ID,
  S1_PRODUCER_A_ID,
  S1_PRODUCER_A_IDP_USER_ID,
  S1_PRODUCER_B_ID,
  S1_PRODUCER_B_IDP_USER_ID,
  SEED_COMMUNITY_ID,
  seedParticipants,
  seedS1Participants,
} from "./seed.js";

describe("seed (INT-230 / INT-236 / INT-241)", () => {
  it("seeds UAT and S1 communities with S1 actor UUIDs", () => {
    const store = new ParticipantsStore();
    expect(store.getCommunity(SEED_COMMUNITY_ID)?.billingMode).toBe("virtual");
    expect(store.getCommunity(S1_COMMUNITY_ID)?.communityId).toBe(
      S1_COMMUNITY_ID,
    );
    expect(store.getParticipant(S1_CONSUMER_ID)?.role).toBe("consumer");
    expect(store.getParticipant(S1_PRODUCER_A_ID)?.selfBillingMandate).toBe(
      true,
    );
    expect(store.getParticipant(S1_PRODUCER_B_ID)?.termsVersionAccepted).toBe(
      "v1.0.0",
    );
    expect(seedS1Participants()).toHaveLength(4);
    expect(seedParticipants().length).toBeGreaterThanOrEqual(7);
  });

  it("binds S1 participants to Keycloak idpUserId (INT-236 / INT-241)", () => {
    const store = new ParticipantsStore();
    expect(store.getParticipant(S1_CONSUMER_ID)?.idpUserId).toBe(
      S1_CONSUMER_IDP_USER_ID,
    );
    expect(store.getParticipant(S1_PRODUCER_A_ID)?.idpUserId).toBe(
      S1_PRODUCER_A_IDP_USER_ID,
    );
    expect(store.getParticipant(S1_PRODUCER_B_ID)?.idpUserId).toBe(
      S1_PRODUCER_B_IDP_USER_ID,
    );
    expect(store.getParticipant(S1_MANAGER_ID)?.idpUserId).toBe(
      S1_MANAGER_IDP_USER_ID,
    );
    expect(store.findByIdpSub(S1_CONSUMER_IDP_USER_ID)?.participantId).toBe(
      S1_CONSUMER_ID,
    );
    expect(store.findByIdpSub(S1_MANAGER_IDP_USER_ID)?.communityId).toBe(
      S1_COMMUNITY_ID,
    );
  });

  it("indexes S1 market actors for ResolveParty", () => {
    const store = new ParticipantsStore();
    expect(store.findByMarketActorId(S1_PRODUCER_A_ID)?.participantId).toBe(
      S1_PRODUCER_A_ID,
    );
  });
});
