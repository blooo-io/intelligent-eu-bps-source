import { describe, expect, it, vi } from "vitest";
import { InMemoryOutboxStore } from "../outbox/outbox.types.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { inTransaction, type TransactionClient } from "./in-transaction.js";
import {
  RecordingTransaction,
  type RecordableStore,
} from "./recording-transaction.js";

/** INT-356 — business rows and outbox rows commit or roll back together. */
describe("inTransaction (INT-356)", () => {
  it("commits and releases on success", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const release = vi.fn();
    const result = await inTransaction(
      async () => ({ query, release }) as TransactionClient,
      async () => "ok",
    );
    expect(result).toBe("ok");
    expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back when the work throws", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const release = vi.fn();
    await expect(
      inTransaction(
        async () => ({ query, release }) as TransactionClient,
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("RecordingTransaction (INT-356)", () => {
  function store(): RecordableStore<string> & { writes: string[]; state: string } {
    return {
      writes: [],
      state: "initial",
      beginRecording() {
        this.writes = [];
      },
      takeRecording() {
        return this.writes.splice(0);
      },
      stopRecording() {
        this.writes = [];
      },
      snapshot() {
        return this.state;
      },
      restore(snapshot: string) {
        this.state = snapshot;
      },
    };
  }

  it("writes the business row and the outbox row on the same client", async () => {
    const memory = store();
    const memoryOutbox = new InMemoryOutboxStore();
    const outbox = new OutboxService(memoryOutbox);
    const query = vi.fn(async () => ({ rows: [] }));
    const tx = new RecordingTransaction(
      memory,
      outbox,
      async () => ({ query, release: () => undefined }),
      async (_sql, writes) => {
        await query("APPLY", writes);
      },
    );
    memory.state = "changed";
    const eventId = await tx.run(async () => {
      memory.writes.push("settlement-1");
      const event = await outbox.append({
        aggregateType: "BillingRun",
        aggregateId: "run-1",
        type: "SettlementCompleted",
        producer: "AC-05",
        communityId: "com",
        billingMode: "virtual",
        data: { runId: "run-1" },
      });
      return event.eventId;
    });
    expect(eventId).toBeTruthy();
    const texts = query.mock.calls.map((call) => String(call[0]));
    expect(texts[0]).toBe("BEGIN");
    expect(texts).toContain("APPLY");
    expect(texts.some((text) => text.includes("INSERT INTO outbox"))).toBe(true);
    expect(texts.at(-1)).toBe("COMMIT");
    // The in-memory outbox is not written; Postgres holds the row.
    expect(await memoryOutbox.list()).toEqual([]);
  });

  it("restores the snapshot when the commit fails", async () => {
    const memory = store();
    const outbox = new OutboxService(new InMemoryOutboxStore());
    const tx = new RecordingTransaction(
      memory,
      outbox,
      async () => ({
        query: async (text: string) => {
          if (text === "COMMIT") throw new Error("disk full");
          return { rows: [] };
        },
        release: () => undefined,
      }),
      async () => undefined,
    );
    await expect(
      tx.run(async () => {
        memory.state = "dirty";
        memory.writes.push("row");
      }),
    ).rejects.toThrow("disk full");
    expect(memory.state).toBe("initial");
  });
});
