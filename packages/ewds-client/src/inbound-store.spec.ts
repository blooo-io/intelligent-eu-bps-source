import { describe, expect, it } from "vitest";
import { InMemoryInboundStore, MAX_RETENTION_MS } from "./inbound-store.js";

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