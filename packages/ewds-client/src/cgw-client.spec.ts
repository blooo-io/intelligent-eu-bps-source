import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CgwClient, CgwError } from "./cgw-client.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("CgwClient", () => {
  it("NFR-017: send posts JSON-stringified payload with x-api-key", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "trade-intake-0",
      fetchImpl: async (u, i) => {
        calls.push([String(u), i!]);
        return new Response(
          JSON.stringify({
            clientGatewayMessageId: "m1",
            recipients: { sent: 1, failed: 0 },
          }),
          { status: 200 },
        );
      },
    });
    const r = await c.send({
      fqcn: "gsy.intelligent.requests.pub",
      topicName: "tradesQuery",
      topicVersion: "1.0.0",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      transactionId: "t1",
      payload: { a: 1 },
    });
    expect(calls[0][0]).toBe("http://cgw/api/v2/messages");
    expect((calls[0][1].headers as Record<string, string>)["x-api-key"]).toBe(
      "k1",
    );
    expect(JSON.parse(String(calls[0][1].body)).payload).toBe('{"a":1}');
    expect(r).toEqual({ messageId: "m1", sent: 1, failed: 0 });
  });

  it("maps signatureValid SUCCESS and invalid values", async () => {
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "c0",
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              id: "1",
              topicName: "t",
              topicOwner: "o",
              topicVersion: "1",
              transactionId: null,
              payload: "{}",
              sender: "s",
              signatureValid: "SUCCESS",
              timestampNanos: 1,
            },
            {
              id: "2",
              topicName: "t",
              topicOwner: "o",
              topicVersion: "1",
              transactionId: null,
              payload: "{}",
              sender: "s",
              signatureValid: true,
              timestampNanos: 1,
            },
            {
              id: "3",
              topicName: "t",
              topicOwner: "o",
              topicVersion: "1",
              transactionId: null,
              payload: "{}",
              sender: "s",
              signatureValid: "FAILED",
              timestampNanos: 1,
            },
          ]),
          { status: 200 },
        ),
    });
    const msgs = await c.receive({ fqcn: "ch" });
    expect(msgs[0].signatureValid).toBe(true);
    expect(msgs[1].signatureValid).toBe(true);
    expect(msgs[2].signatureValid).toBe(false);
  });

  it("receive passes clientId and amount, maps signatureValid 'VALID' -> true", async () => {
    const calls: string[] = [];
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "trade-intake-0",
      fetchImpl: async (u) => {
        calls.push(String(u));
        return new Response(
          JSON.stringify([
            {
              id: "110",
              topicName: "tradesQueryResponse",
              topicOwner: "integration.apps.intelligent.auth.ewc",
              topicVersion: "1.0.0",
              transactionId: "r1",
              payload: "{}",
              sender: "did:ethr:0x1",
              signatureValid: "VALID",
              timestampNanos: 1,
            },
          ]),
          { status: 200 },
        );
      },
    });
    const msgs = await c.receive({
      fqcn: "gsy.intelligent.responses.sub",
      amount: 50,
    });
    expect(calls[0]).toContain("clientId=trade-intake-0");
    expect(calls[0]).toContain("amount=50");
    expect(msgs[0].signatureValid).toBe(true);
  });

  it("non-2xx throws CgwError with status 401 and path", async () => {
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "c0",
      fetchImpl: async () => new Response("nope", { status: 401 }),
    });
    await expect(c.identity()).rejects.toMatchObject({
      status: 401,
      path: "/api/v2/identity",
    });
    await expect(c.identity()).rejects.toBeInstanceOf(CgwError);
  });

  it("never logs or echoes the api key in CgwError.message", async () => {
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "c0",
      fetchImpl: async () => new Response("denied", { status: 403 }),
    });
    try {
      await c.send({
        fqcn: "ch",
        topicName: "t",
        topicVersion: "1.0.0",
        topicOwner: "o",
        payload: {},
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CgwError);
      expect((err as CgwError).message).not.toContain("k1");
    }
  });

  it("identity returns DID and balance", async () => {
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "c0",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            balance: "OK",
            enrolment: { did: "did:ethr:abc" },
          }),
          { status: 200 },
        ),
    });
    await expect(c.identity()).resolves.toEqual({
      did: "did:ethr:abc",
      balance: "OK",
    });
  });

  it("receive forwards topic filters", async () => {
    const calls: string[] = [];
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "c0",
      fetchImpl: async (u) => {
        calls.push(String(u));
        return new Response("[]", { status: 200 });
      },
    });
    await c.receive({
      fqcn: "ch",
      topicName: "billingInvoice",
      topicOwner: "blooo.apps.intelligent.auth.ewc",
    });
    expect(calls[0]).toContain("topicName=billingInvoice");
    expect(calls[0]).toContain("topicOwner=blooo.apps.intelligent.auth.ewc");
  });

  it("ack posts message ids when snapshot defines /messages/ack", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const c = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k1",
      clientId: "pod-0",
      fetchImpl: async (u, i) => {
        calls.push([String(u), i!]);
        return new Response("{}", { status: 200 });
      },
    });
    await c.ack(["m1", "m2"]);
    expect(calls[0][0]).toBe("http://cgw/api/v2/messages/ack");
    expect(JSON.parse(String(calls[0][1].body))).toEqual({
      messageIds: ["m1", "m2"],
      clientId: "pod-0",
    });
  });

  it("snapshot declares every path CgwClient calls", () => {
    const snap = JSON.parse(
      readFileSync(path.join(pkgRoot, "test/cgw-openapi.snapshot.json"), "utf8"),
    ) as {
      info?: { "x-captured-from"?: string };
      paths: Record<string, unknown>;
    };
    for (const p of ["/api/v2/messages", "/api/v2/messages/ack", "/api/v2/identity"]) {
      expect(snap.paths[p], p).toBeDefined();
    }
    // Task 4.4 / INT-437: refuse the old stub marker once live /docs-json is pinned.
    const captured = snap.info?.["x-captured-from"] ?? "";
    expect(captured).toMatch(/live \/docs-json/);
    expect(captured).not.toMatch(/stub\+/);
  });
});