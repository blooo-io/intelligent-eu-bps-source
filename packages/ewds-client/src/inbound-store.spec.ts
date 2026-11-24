import { describe, expect, it, vi } from "vitest";
import {
  InMemoryInboundStore,
  MAX_RETENTION_MS,
  PgInboundStore,
} from "./inbound-store.js";

describe("InMemoryInboundStore (REQ-053)", () => {
  it("REQ-053 UAT-069: purge removes payloads of processed rows and every row older than 7 days", async () => {
    const s = new InMemoryInboundStore();
    await s.saveIfNew({
      messageId: "a",
      topicName: "t",
      sender: "did:ethr:0x1",
      receivedAt: "2026-11-01T00:00:00Z",
      payload: "{}",
      status: "received",
    });
    await s.saveIfNew({
      messageId: "b",
      topicName: "t",
      sender: "did:ethr:0x1",
      receivedAt: "2026-11-20T00:00:00Z",
      payload: "{}",
      status: "received",
    });
    expect(await s.purge(new Date("2026-11-24T00:00:00Z"))).toBe(1);
    await expect(s.purge(new Date(), 8 * 86400000)).rejects.toThrow(
      "retention above 7 days",
    );
  });

  it("nulls payload on processed rows during purge", async () => {
    const s = new InMemoryInboundStore();
    await s.saveIfNew({
      messageId: "c",
      topicName: "t",
      sender: "did:ethr:0x1",
      receivedAt: new Date().toISOString(),
      payload: '{"x":1}',
      status: "received",
    });
    await s.mark("c", "processed");
    await s.purge(new Date(), MAX_RETENTION_MS);
    const rows = (s as unknown as { rows: Map<string, { payload: string | null }> })
      .rows;
    expect(rows.get("c")?.payload).toBeNull();
  });
});

describe("PgInboundStore", () => {
  it("mark and purge run SQL", async () => {
    const sql = {
      query: vi.fn(async (text: string) => {
        if (text.startsWith("DELETE")) return { rows: [{ message_id: "old" }] };
        return { rows: [] };
      }),
    };
    const s = new PgInboundStore(sql);
    await s.mark("m1", "processed");
    expect(await s.purge(new Date("2026-11-24T00:00:00Z"))).toBe(1);
  });

  it("saveIfNew returns false on conflict", async () => {
    const sql = {
      query: async (text: string) => {
        if (text.includes("ON CONFLICT")) return { rows: [] };
        return { rows: [{ message_id: "x" }] };
      },
    };
    const s = new PgInboundStore(sql);
    expect(
      await s.saveIfNew({
        messageId: "x",
        topicName: "t",
        sender: "did:1",
        receivedAt: "2026-11-20T00:00:00Z",
        payload: "{}",
        status: "received",
      }),
    ).toBe(false);
  });
});