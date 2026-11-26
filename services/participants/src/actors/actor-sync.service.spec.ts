/**
 * REQ-008 / REQ-058 / UAT-008 / INT-447 — EWDS Actor sync (project path).
 * CSV import helpers remain for reference-client / conflict tests only.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { ewdsActorFixtures } from "@intelligent/mocks";
import { ParticipantsStore } from "../domain/store.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { ParticipantsService } from "../participants/participants.service.js";
import { deriveReadiness } from "../participants/readiness.js";
import type { ActorRecord } from "./actor-source.port.js";
import { ActorSyncService } from "./actor-sync.service.js";
import { MockActorSourceAdapter } from "./mock-actor-source.adapter.js";

describe("ActorSyncService (REQ-008 / UAT-008)", () => {
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
        async list(communityId: string) {
          return { communityId, periods: [] as string[] };
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

  it("REQ-008 / UAT-008: four EWDS actors create participants (R2M CSV = N Actors)", async () => {
    // INT-447 — fourth row simulates a CSV line published as another Actor by R2M.
    const fourth: ActorRecord = {
      ...actors[0]!,
      actorId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee4",
      gsyActorId: "gsy-r2m-csv-fourth",
      meterId: "m-r2m-4",
      name: "R2M Csv Fourth",
      contact: { email: "r2m-csv-fourth@example.invalid" },
      version: "1",
    };
    const four = [...actors, fourth];
    const syncFour = new ActorSyncService(
      store,
      new OutboxService(outboxStore),
      idp,
      new MockActorSourceAdapter(four),
    );
    const result = await syncFour.sync(communityId);
    expect(result).toEqual({ created: 4, updated: 0, skipped: 0 });

    for (const actor of four) {
      const row = store.getParticipant(actor.actorId)!;
      expect(row.source).toBe("ewds");
      expect(row.participantId).toBe(actor.actorId);
      expect(row.profile?.name.trim().length).toBeGreaterThan(0);
      expect(deriveReadiness(row)).toBe("ProfileCompleted");
    }
  });

  it("REQ-008: second sync with same versions is a no-op", async () => {
    await sync.sync(communityId);
    const second = await sync.sync(communityId);
    expect(second).toEqual({ created: 0, updated: 0, skipped: 3 });
  });

  it("REQ-058: CSV row on an EWDS actor id is rejected", async () => {
    await sync.sync(communityId);
    const ewds = actors[0]!;
    await expect(
      participants.importParticipants(communityId, [
        {
          email: "clash@example.invalid",
          marketActorId: ewds.gsyActorId,
          meterId: "m-clash",
          role: "consumer",
        },
      ]),
    ).rejects.toThrow(/marketActorId already sourced from EWDS/);
  });

  it("no personal data in ParticipantOnboarded", async () => {
    await sync.sync(communityId);
    const events = await outboxStore.list();
    const onboarded = events.filter((e) => e.event.type === "ParticipantOnboarded");
    expect(onboarded.length).toBe(3);
    const serialized = JSON.stringify(onboarded);
    for (const actor of actors) {
      expect(serialized).not.toContain(actor.contact.email);
      expect(serialized).not.toContain(actor.name);
    }
  });

  it("REQ-008: version change updates profile", async () => {
    await sync.sync(communityId);
    const bumped: ActorRecord[] = actors.map((a, i) =>
      i === 0
        ? {
            ...a,
            version: "2",
            name: "Elena Costa Updated",
            address: { ...a.address, street: "Via Nuova 1" },
          }
        : a,
    );
    const sync2 = new ActorSyncService(
      store,
      new OutboxService(outboxStore),
      idp,
      new MockActorSourceAdapter(bumped),
    );
    const result = await sync2.sync(communityId);
    expect(result).toEqual({ created: 0, updated: 1, skipped: 2 });
    expect(store.getParticipant(actors[0]!.actorId)?.profile?.name).toBe(
      "Elena Costa Updated",
    );
    expect(store.getParticipant(actors[0]!.actorId)?.actorVersion).toBe("2");
  });

  it("REQ-008: CSV participant on gsyActorId is skipped", async () => {
    await participants.importParticipants(communityId, [
      {
        email: "preexisting@example.invalid",
        marketActorId: actors[0]!.gsyActorId,
        meterId: "m-pre",
        role: "consumer",
      },
    ]);
    const result = await sync.sync(communityId);
    expect(result).toEqual({ created: 2, updated: 0, skipped: 1 });
  });
});
