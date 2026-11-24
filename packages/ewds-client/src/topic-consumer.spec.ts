import { describe, expect, it, vi } from "vitest";
import type { CgwClient, CgwMessage } from "./cgw-client.js";
import { InMemoryInboundStore } from "./inbound-store.js";
import { EwdsTopicConsumer } from "./topic-consumer.js";

describe("EwdsTopicConsumer (REQ-001)", () => {
  it("REQ-001: pull dedupes a redelivered messageId and acks only after save", async () => {
    const ack = vi.fn(async () => {});
    const cgw = {
      receive: vi.fn(async () => [sampleMsg("m1", "did:ethr:0x1", '{"ok":true}')]),
      ack,
    } as unknown as CgwClient;
    const store = new InMemoryInboundStore();
    const saveSpy = vi.spyOn(store, "saveIfNew");
    const consumer = new EwdsTopicConsumer(
      cgw,
      store,
      {
        fqcn: "blooo.intelligent.billing.sub",
        topicName: "billingInvoice",
        topicOwner: "blooo.apps.intelligent.auth.ewc",
      },
      (x): x is { ok: boolean } => typeof x === "object" && x !== null,
    );
    const first = await consumer.pull();
    expect(first).toHaveLength(1);
    expect(saveSpy).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(["m1"]);

    ack.mockClear();
    (cgw.receive as ReturnType<typeof vi.fn>).mockResolvedValue([
      sampleMsg("m1", "did:ethr:0x1", '{"ok":true}'),
    ]);
    const second = await consumer.pull();
    expect(second).toHaveLength(0);
    expect(ack).toHaveBeenCalledWith(["m1"]);
  });

  it("drops (status rejected, no body returned) a message from a sender not in allowedSenders", async () => {
    const cgw = {
      receive: vi.fn(async () => [
        sampleMsg("x1", "did:ethr:bad", '{"ok":true}'),
      ]),
      ack: vi.fn(async () => {}),
    } as unknown as CgwClient;
    const store = new InMemoryInboundStore();
    const consumer = new EwdsTopicConsumer(cgw, store, {
      fqcn: "blooo.intelligent.billing.sub",
      topicName: "billingInvoice",
      topicOwner: "blooo.apps.intelligent.auth.ewc",
      allowedSenders: ["did:ethr:good"],
    });
    const rows = await consumer.pull();
    expect(rows).toHaveLength(0);
    expect(await storeHasStatus(store, "x1", "rejected")).toBe(true);
  });

  it("rejects payload failing validate()", async () => {
    const cgw = {
      receive: vi.fn(async () => [
        sampleMsg("v1", "did:ethr:0x1", '{"ok":false}'),
      ]),
      ack: vi.fn(async () => {}),
    } as unknown as CgwClient;
    const store = new InMemoryInboundStore();
    const consumer = new EwdsTopicConsumer(
      cgw,
      store,
      {
        fqcn: "blooo.intelligent.billing.sub",
        topicName: "billingInvoice",
        topicOwner: "blooo.apps.intelligent.auth.ewc",
      },
      (x): x is { ok: true } =>
        typeof x === "object" && x !== null && (x as { ok: boolean }).ok === true,
    );
    expect(await consumer.pull()).toHaveLength(0);
  });

  it("done() marks processed", async () => {
    const store = new InMemoryInboundStore();
    await store.saveIfNew({
      messageId: "d1",
      topicName: "t",
      sender: "s",
      receivedAt: new Date().toISOString(),
      payload: "{}",
      status: "received",
    });
    const consumer = new EwdsTopicConsumer(
      { receive: vi.fn(), ack: vi.fn() } as unknown as CgwClient,
      store,
      {
        fqcn: "f",
        topicName: "t",
        topicOwner: "o",
      },
    );
    await consumer.done("d1", true);
    expect(await storeHasStatus(store, "d1", "processed")).toBe(true);
  });

  it("marks invalid JSON as rejected", async () => {
    const cgw = {
      receive: vi.fn(async () => [
        sampleMsg("bad-json", "did:ethr:0x1", "not-json"),
      ]),
      ack: vi.fn(async () => {}),
    } as unknown as CgwClient;
    const store = new InMemoryInboundStore();
    const consumer = new EwdsTopicConsumer(cgw, store, {
      fqcn: "blooo.intelligent.billing.sub",
      topicName: "billingInvoice",
      topicOwner: "blooo.apps.intelligent.auth.ewc",
    });
    expect(await consumer.pull()).toHaveLength(0);
    expect(await storeHasStatus(store, "bad-json", "rejected")).toBe(true);
  });

  it("drops a message with signatureValid=false", async () => {
    const msg = sampleMsg("x2", "did:ethr:0x1", "{}");
    msg.signatureValid = false;
    const cgw = {
      receive: vi.fn(async () => [msg]),
      ack: vi.fn(async () => {}),
    } as unknown as CgwClient;
    const store = new InMemoryInboundStore();
    const consumer = new EwdsTopicConsumer(cgw, store, {
      fqcn: "blooo.intelligent.billing.sub",
      topicName: "billingInvoice",
      topicOwner: "blooo.apps.intelligent.auth.ewc",
    });
    expect(await consumer.pull()).toHaveLength(0);
    expect(await storeHasStatus(store, "x2", "rejected")).toBe(true);
  });
});

async function storeHasStatus(
  store: InMemoryInboundStore,
  messageId: string,
  status: string,
): Promise<boolean> {
  const map = (
    store as unknown as {
      rows: Map<string, { status: string }>;
    }
  ).rows;
  return map.get(messageId)?.status === status;
}

function sampleMsg(
  id: string,
  sender: string,
  payload: string,
): CgwMessage {
  return {
    id,
    topicName: "billingInvoice",
    topicOwner: "blooo.apps.intelligent.auth.ewc",
    topicVersion: "1.0.0",
    transactionId: null,
    payload,
    sender,
    signatureValid: true,
    timestampNanos: 1,
  };
}