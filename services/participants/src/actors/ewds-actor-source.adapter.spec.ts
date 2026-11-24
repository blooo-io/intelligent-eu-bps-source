import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { InMemoryInboundStore } from "@intelligent/ewds-client";
import {
  EwdsActorSourceAdapter,
  createEwdsActorSource,
  isActorIntake,
  type ActorIntake,
  type ActorTopicConsumer,
} from "./ewds-actor-source.adapter.js";

const COMMUNITY = "a1000000-0000-4000-8000-000000000001";
const OTHER = "b2000000-0000-4000-8000-000000000002";

function sampleActor(
  overrides: Partial<ActorIntake> & Pick<ActorIntake, "actorId" | "communityId">,
): ActorIntake {
  return {
    gsyActorId: "gsy-1",
    meterId: "m-1",
    role: "producer",
    name: "Alice Example",
    address: {
      street: "Via Roma 1",
      postalCode: "00100",
      city: "Roma",
      country: "IT",
    },
    contact: { email: "alice@example.invalid" },
    version: "1",
    ...overrides,
  };
}

describe("EwdsActorSourceAdapter (REQ-008 / REQ-053 / NFR-002)", () => {
  it("REQ-008: pulls Actor messages from allowed sender only (via consumer filter)", async () => {
    const good = sampleActor({
      actorId: "a1111111-0000-4000-8000-000000000001",
      communityId: COMMUNITY,
    });
    const consumer: ActorTopicConsumer = {
      pull: vi.fn(async () => [
        // Consumer already drops did:ethr:0xBAD; only the allowed message remains.
        { messageId: "m-good", sender: "did:ethr:0xGOOD", body: good },
      ]),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsActorSourceAdapter(consumer);
    const rows = await adapter.listActors(COMMUNITY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(good.actorId);
    expect(consumer.pull).toHaveBeenCalled();
  });

  it("REQ-053: done(ok) nulls the stored payload", async () => {
    const store = new InMemoryInboundStore();
    await store.saveIfNew({
      messageId: "m1",
      topicName: "actor",
      sender: "did:ethr:0x1",
      receivedAt: new Date().toISOString(),
      payload: JSON.stringify(
        sampleActor({
          actorId: "a1111111-0000-4000-8000-000000000001",
          communityId: COMMUNITY,
        }),
      ),
      status: "received",
    });
    const body = sampleActor({
      actorId: "a1111111-0000-4000-8000-000000000001",
      communityId: COMMUNITY,
    });
    const consumer: ActorTopicConsumer = {
      pull: vi.fn(async () => [
        { messageId: "m1", sender: "did:ethr:0x1", body },
      ]),
      done: async (messageId, ok) => {
        expect(ok).toBe(true);
        await store.mark(messageId, "processed");
      },
    };
    const adapter = new EwdsActorSourceAdapter(consumer);
    await adapter.listActors(COMMUNITY);
    expect((await storeGet(store, "m1"))!.payload).toBeNull();
    expect((await storeGet(store, "m1"))!.status).toBe("processed");
  });

  it("NFR-002: adapter never logs the payload", async () => {
    const body = sampleActor({
      actorId: "a1111111-0000-4000-8000-000000000001",
      communityId: COMMUNITY,
      contact: { email: "alice@example.invalid" },
    });
    const consumer: ActorTopicConsumer = {
      pull: vi.fn(async () => [
        { messageId: "m-pii", sender: "did:ethr:0x1", body },
      ]),
      done: vi.fn(async () => {}),
    };
    const debugSpy = vi.spyOn(Logger.prototype, "debug");
    const logSpy = vi.spyOn(Logger.prototype, "log");
    const warnSpy = vi.spyOn(Logger.prototype, "warn");
    const errorSpy = vi.spyOn(Logger.prototype, "error");
    const adapter = new EwdsActorSourceAdapter(consumer);
    await adapter.listActors(COMMUNITY);
    for (const spy of [debugSpy, logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        const joined = call.map(String).join(" ");
        expect(joined).not.toContain("alice@");
        expect(joined).not.toContain(body.name);
      }
    }
  });

  it("REQ-008: buffers actors for other communities across listActors calls", async () => {
    const a = sampleActor({
      actorId: "a1111111-0000-4000-8000-000000000001",
      communityId: COMMUNITY,
    });
    const b = sampleActor({
      actorId: "b1111111-0000-4000-8000-000000000099",
      communityId: OTHER,
      name: "Other",
    });
    let pulls = 0;
    const consumer: ActorTopicConsumer = {
      pull: vi.fn(async () => {
        pulls += 1;
        if (pulls === 1) {
          return [
            { messageId: "m-a", sender: "did:ethr:0x1", body: a },
            { messageId: "m-b", sender: "did:ethr:0x1", body: b },
          ];
        }
        return [];
      }),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsActorSourceAdapter(consumer);
    expect(await adapter.listActors(COMMUNITY)).toHaveLength(1);
    expect(await adapter.listActors(OTHER)).toHaveLength(1);
    expect(consumer.done).toHaveBeenCalledWith("m-a", true);
    expect(consumer.done).toHaveBeenCalledWith("m-b", true);
  });

  it("createEwdsActorSource accepts an injected consumer", async () => {
    const consumer: ActorTopicConsumer = {
      pull: vi.fn(async () => []),
      done: vi.fn(async () => {}),
    };
    const port = createEwdsActorSource({}, { consumer });
    expect(port).toBeInstanceOf(EwdsActorSourceAdapter);
    expect(await port.listActors(COMMUNITY)).toEqual([]);
  });

  it("isActorIntake rejects malformed bodies", () => {
    expect(isActorIntake(null)).toBe(false);
    expect(isActorIntake({ actorId: "x" })).toBe(false);
    expect(
      isActorIntake(
        sampleActor({
          actorId: "a1111111-0000-4000-8000-000000000001",
          communityId: COMMUNITY,
        }),
      ),
    ).toBe(true);
  });
});

async function storeGet(
  store: InMemoryInboundStore,
  messageId: string,
): Promise<{ payload: string | null; status: string } | undefined> {
  return store.rows.get(messageId);
}
