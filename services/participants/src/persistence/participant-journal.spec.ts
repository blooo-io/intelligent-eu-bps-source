import { describe, expect, it, vi } from "vitest";
import { InMemoryOutboxStore, OutboxService } from "@intelligent/module-template";
import { SEED_COMMUNITY_ID } from "../domain/seed.js";
import { ParticipantsStore } from "../domain/store.js";
import {
  applyParticipantWrites,
  createParticipantTransaction,
  hydrateParticipants,
} from "./participant-journal.js";

describe("participant journal (INT-356)", () => {
  it("applyParticipantWrites upserts participants and communities", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new ParticipantsStore();
    const participant = store.getParticipant(
      "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
    )!;
    const community = store.getCommunity(SEED_COMMUNITY_ID)!;

    await applyParticipantWrites({ query }, [
      { kind: "participant", row: participant },
      { kind: "community", row: community },
    ]);

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0]?.[0])).toContain("participants");
    expect(String(query.mock.calls[1]?.[0])).toContain("communities");
  });

  it("hydrateParticipants seeds an empty database from the in-memory store", async () => {
    const store = new ParticipantsStore();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      return { rows: [] };
    });
    await hydrateParticipants({ query }, store);
    const applyCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO"),
    );
    expect(applyCalls.length).toBeGreaterThan(0);
  });

  it("hydrateParticipants restores rows when the database is populated", async () => {
    const store = new ParticipantsStore();
    const participant = store.getParticipant(
      "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
    )!;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      if (sql.includes("FROM participants")) {
        return { rows: [{ payload: JSON.stringify(participant) }] };
      }
      if (sql.includes("FROM communities")) {
        return { rows: [{ payload: { communityId: participant.communityId } }] };
      }
      return { rows: [] };
    });

    await hydrateParticipants({ query }, store);
    expect(store.getParticipant(participant.participantId)?.meterId).toBe(
      participant.meterId,
    );
  });

  it("REQ-015: hydrated communities persisted without autoPayout read as false", async () => {
    const store = new ParticipantsStore();
    const { autoPayout: _omitted, ...legacy } = store.getCommunity(SEED_COMMUNITY_ID)!;
    const enabled = { ...legacy, communityId: "33333333-3333-4333-8333-333333333333", autoPayout: true };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM communities")) {
        return { rows: [{ payload: JSON.stringify(legacy) }, { payload: enabled }] };
      }
      return { rows: [] };
    });

    await hydrateParticipants({ query }, store);
    expect(store.getCommunity(SEED_COMMUNITY_ID)?.autoPayout).toBe(false);
    expect(store.getCommunity(enabled.communityId)?.autoPayout).toBe(true);
  });

  it("createParticipantTransaction uses passthrough when DATABASE_URL is unset", async () => {
    const store = new ParticipantsStore();
    const outbox = new OutboxService(new InMemoryOutboxStore());
    const { transaction, hydrate } = createParticipantTransaction(store, outbox, {});
    expect(transaction).toBeDefined();
    await expect(hydrate()).resolves.toBeUndefined();
  });
});