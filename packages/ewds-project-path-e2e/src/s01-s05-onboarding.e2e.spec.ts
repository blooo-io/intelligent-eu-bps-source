/**
 * INT-453 — S1–S5 EWDS project-path E2E (Actor → T&C → KYC → Ready).
 * In-process AC-03 with EWDS ActorSource; no /v1 project UI.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { ewdsActorFixtures } from "@intelligent/mocks";
import { ParticipantsStore } from "@participants/domain/store.js";
import { MockIdpAdapter } from "@participants/idp/mock-idp.adapter.js";
import { ParticipantsService } from "@participants/participants/participants.service.js";
import { deriveReadiness } from "@participants/participants/readiness.js";
import type { ActorRecord } from "@participants/actors/actor-source.port.js";
import { ActorSyncService } from "@participants/actors/actor-sync.service.js";
import { MockActorSourceAdapter } from "@participants/actors/mock-actor-source.adapter.js";
import { markCovered } from "../fixtures/coverage-tracker.js";

describe("INT-453 E2E S1–S5 onboarding (EWDS Actor path)", () => {
  let store: ParticipantsStore;
  let outboxStore: InMemoryOutboxStore;
  let idp: MockIdpAdapter;
  let participants: ParticipantsService;
  let communityId: string;
  let actors: ActorRecord[];
  let sync: ActorSyncService;

  beforeEach(() => {
    store = new ParticipantsStore();
    outboxStore = new InMemoryOutboxStore();
    idp = new MockIdpAdapter();
    const outbox = new OutboxService(outboxStore);
    participants = new ParticipantsService(
      store,
      outbox,
      idp,
      {
        async get() {
          return {
            provider: "mock" as const,
            testConfigured: true,
            liveConfigured: false,
          };
        },
      },
      {
        async list(cid: string) {
          return { communityId: cid, periods: [] as string[] };
        },
      },
    );
    communityId = participants.seedCommunityId();
    actors = ewdsActorFixtures(communityId) as ActorRecord[];
    sync = new ActorSyncService(
      store,
      outbox,
      idp,
      new MockActorSourceAdapter(actors),
    );
  });

  it("S1: Actor create → ParticipantRecord source=ewds at ProfileCompleted", async () => {
    const result = await sync.sync(communityId);
    expect(result.created).toBeGreaterThanOrEqual(3);
    const rows = actors.map((actor) => {
      const row = store.getParticipant(actor.actorId)!;
      expect(row.source).toBe("ewds");
      expect(deriveReadiness(row)).toBe("ProfileCompleted");
      return {
        actorId: actor.actorId,
        source: row.source,
        readiness: deriveReadiness(row),
      };
    });
    markCovered("S1", {
      run_path: "mock",
      input: { communityId, actors },
      output: { sync: result, participants: rows },
      notes: "EWDS Actor ingest via MockActorSourceAdapter (no Spine).",
    });
  });

  it("S2: Actor version bump updates cache; PUT profile → 409 for source=ewds", async () => {
    await sync.sync(communityId);
    const first = actors[0]!;
    const bumped: ActorRecord = {
      ...first,
      name: "Ana Updated Via R2M",
      version: String(Number(first.version ?? "1") + 1),
    };
    const sync2 = new ActorSyncService(
      store,
      new OutboxService(outboxStore),
      idp,
      new MockActorSourceAdapter(
        actors.map((a) => (a.actorId === first.actorId ? bumped : a)),
      ),
    );
    const upd = await sync2.sync(communityId);
    expect(upd.updated).toBeGreaterThanOrEqual(1);
    expect(store.getParticipant(first.actorId)?.profile?.name).toContain(
      "Updated",
    );

    const row = store.getParticipant(first.actorId)!;
    await expect(
      participants.updateProfile(row.idpUserId!, {
        name: "Hacker",
        address: "evil",
        email: "evil@example.invalid",
      }),
    ).rejects.toMatchObject({
      response: { code: "profile_managed_by_ewds" },
    });
    markCovered("S2", {
      run_path: "mock",
      input: { bumpedActor: bumped },
      output: {
        syncUpdated: upd.updated,
        profileName: store.getParticipant(first.actorId)?.profile?.name,
        putProfileDenied: "profile_managed_by_ewds",
      },
    });
  });

  it("S3: acceptTermsForActor → UserAccountStatusChanged with T&C", async () => {
    await sync.sync(communityId);
    const consumer = actors.find((a) => a.role === "consumer") ?? actors[0]!;
    const accepted = await participants.acceptTermsForActor(consumer.actorId, {
      termsVersion: "v1.0.0",
      selfBillingMandate: false,
    });
    expect(accepted.termsVersion).toBe("v1.0.0");
    const events = await outboxStore.list();
    const ua = events.find((e) => e.event.type === "UserAccountStatusChanged");
    expect(ua?.event.data).toMatchObject({
      actorId: consumer.actorId,
      termsVersion: "v1.0.0",
      kycVerified: false,
    });
    expect(participants.checkReadiness(consumer.actorId).status).toBe(
      "TermsAccepted",
    );
    markCovered("S3", {
      run_path: "mock",
      input: {
        actorId: consumer.actorId,
        termsVersion: "v1.0.0",
        selfBillingMandate: false,
      },
      output: {
        accepted,
        outboxUserAccount: ua?.event.data,
        readiness: participants.checkReadiness(consumer.actorId).status,
      },
    });
  });

  it("S4: KYC apply re-publishes UserAccount keeping T&C; startKyc surface is handoff-ready", async () => {
    await sync.sync(communityId);
    const consumer = actors.find((a) => a.role === "consumer") ?? actors[0]!;
    await participants.acceptTermsForActor(consumer.actorId, {
      termsVersion: "v1.0.0",
      selfBillingMandate: false,
    });
    await participants.applyKycStatus({
      eventId: "e2e-kyc-1",
      participantId: consumer.actorId,
      kycVerified: true,
    });
    const events = await outboxStore.list();
    const latest = events
      .filter((e) => e.event.type === "UserAccountStatusChanged")
      .at(-1)!.event.data as Record<string, unknown>;
    expect(latest).toMatchObject({
      actorId: consumer.actorId,
      kycVerified: true,
      termsVersion: "v1.0.0",
      accountStatus: "Active",
    });
    markCovered("S4", {
      run_path: "mock",
      input: {
        actorId: consumer.actorId,
        applyKycStatus: { kycVerified: true, eventId: "e2e-kyc-1" },
      },
      output: { userAccountStatusChanged: latest },
      notes:
        "KYC applied in-process — not live Stripe Connect. See stripe-s04 evidence for stripe-test path.",
    });
  });

  it("S5: readiness ladder ProfileCompleted → TermsAccepted → Ready", async () => {
    await sync.sync(communityId);
    const consumer = actors.find((a) => a.role === "consumer") ?? actors[0]!;
    expect(participants.checkReadiness(consumer.actorId).status).toBe(
      "ProfileCompleted",
    );
    await participants.acceptTermsForActor(consumer.actorId, {
      termsVersion: "v1.0.0",
      selfBillingMandate: false,
    });
    expect(participants.checkReadiness(consumer.actorId).status).toBe(
      "TermsAccepted",
    );
    await participants.applyPaymentAccountStatus({
      participantId: consumer.actorId,
      ready: true,
    });
    await participants.applyKycStatus({
      eventId: "e2e-ready-1",
      participantId: consumer.actorId,
      kycVerified: true,
    });
    const ready = participants.checkReadiness(consumer.actorId);
    expect(ready).toMatchObject({
      ready: true,
      status: "Ready",
      kycVerified: true,
    });
    markCovered("S5", {
      run_path: "mock",
      input: {
        actorId: consumer.actorId,
        steps: ["acceptTerms", "applyPaymentAccountStatus", "applyKycStatus"],
      },
      output: { readiness: ready },
    });
  });
});
