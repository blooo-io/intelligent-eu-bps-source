/**
 * INT-441 / REQ-052 — Mock CGW protocol + command-channel use cases.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CgwClient } from "./cgw-client.js";
import { startMockCgwServer, type MockCgwListen } from "./mock-cgw-server.js";
import {
  commandChannelScenarios,
  MOCK_CGW_COMMAND_FQCN,
  MOCK_CGW_REPLY_FQCN,
  MOCK_CGW_TOPIC_OWNER,
} from "./mock-cgw-scenarios.js";
import { createTopicValidator } from "./topic-validator.js";

const validateRequest = createTopicValidator("billingCommandRequest");
const validateReply = createTopicValidator("billingCommandReply");

describe("MockCgwServer (INT-441)", () => {
  let stub: MockCgwListen | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  it("NFR-017: identity + x-api-key round-trip with CgwClient", async () => {
    stub = await startMockCgwServer();
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-test",
    });
    const id = await client.identity();
    expect(id.did).toBe(stub.gatewayDid);
    expect(id.balance).toBe("OK");
  });

  it("rejects missing x-api-key", async () => {
    stub = await startMockCgwServer();
    const res = await fetch(`${stub.baseUrl}/api/v2/identity`);
    expect(res.status).toBe(401);
  });

  it("CgwClient send → receive → ack on command FQCN", async () => {
    stub = await startMockCgwServer();
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-test",
    });
    const scenario = commandChannelScenarios().find(
      (s) => s.operation === "startPayment",
    )!;
    // Force ack path so CGW_ACK_MODE is not required.
    process.env.CGW_ACK_MODE = "fetch";

    const sent = await client.send({
      fqcn: MOCK_CGW_COMMAND_FQCN,
      topicName: "billingCommandRequest",
      topicVersion: "1.0.0",
      topicOwner: MOCK_CGW_TOPIC_OWNER,
      transactionId: scenario.request.requestId,
      payload: scenario.request,
    });
    expect(sent.messageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const pulled = await client.receive({
      fqcn: MOCK_CGW_COMMAND_FQCN,
      topicName: "billingCommandRequest",
    });
    expect(pulled).toHaveLength(1);
    expect(JSON.parse(pulled[0]!.payload)).toEqual(scenario.request);
    expect(pulled[0]!.signatureValid).toBe(true);

    await client.ack([pulled[0]!.id]);
    const afterAck = await client.receive({
      fqcn: MOCK_CGW_COMMAND_FQCN,
      topicName: "billingCommandRequest",
    });
    expect(afterAck).toHaveLength(0);
  });

  it("rejects invalid billingCommandRequest on POST", async () => {
    stub = await startMockCgwServer();
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-test",
    });
    await expect(
      client.send({
        fqcn: MOCK_CGW_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        topicVersion: "1.0.0",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        payload: { operation: "startPayment" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("REQ-052: every command use-case request and reply validates + round-trips", async () => {
    stub = await startMockCgwServer();
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-test",
    });
    process.env.CGW_ACK_MODE = "fetch";

    for (const scenario of commandChannelScenarios()) {
      expect(
        validateRequest(scenario.request),
        `${scenario.operation} request schema`,
      ).toEqual({ ok: true, errors: [] });
      expect(
        validateReply(scenario.reply),
        `${scenario.operation} reply schema`,
      ).toEqual({ ok: true, errors: [] });

      // Project UI injects the command (peer publish into our stub inbox).
      const injected = stub.inject({
        fqcn: MOCK_CGW_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        transactionId: scenario.request.requestId,
        payload: scenario.request,
        sender: "did:ethr:volta:0xMockCgwR2M00000000000000000000000002",
      });
      expect(injected.validationErrors).toEqual([]);

      const requests = await client.receive({
        fqcn: MOCK_CGW_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        amount: 1,
      });
      expect(requests[0]?.id).toBe(injected.messageId);
      await client.ack([injected.messageId]);

      // BPS posts the reply; UI-side client would poll the reply FQCN.
      await client.send({
        fqcn: MOCK_CGW_REPLY_FQCN,
        topicName: "billingCommandReply",
        topicVersion: "1.0.0",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        transactionId: scenario.reply.requestId,
        payload: scenario.reply,
      });
      const replies = await client.receive({
        fqcn: MOCK_CGW_REPLY_FQCN,
        topicName: "billingCommandReply",
        amount: 1,
      });
      expect(JSON.parse(replies[0]!.payload)).toEqual(scenario.reply);
      await client.ack([replies[0]!.id]);
    }
  });

  it("inject() refuses invalid request without enqueueing", async () => {
    stub = await startMockCgwServer();
    const bad = stub.inject({
      fqcn: MOCK_CGW_COMMAND_FQCN,
      topicName: "billingCommandRequest",
      payload: { not: "a command" },
    });
    expect(bad.messageId).toBe("");
    expect(bad.validationErrors.length).toBeGreaterThan(0);
    expect(stub.queue()).toHaveLength(0);
  });

  it("validateTopics=false accepts invalid command payloads", async () => {
    stub = await startMockCgwServer({ validateTopics: false });
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-test",
    });
    const sent = await client.send({
      fqcn: MOCK_CGW_COMMAND_FQCN,
      topicName: "billingCommandRequest",
      topicVersion: "1.0.0",
      topicOwner: MOCK_CGW_TOPIC_OWNER,
      payload: { broken: true },
    });
    expect(sent.messageId).toBeTruthy();
  });

  it("returns 404 for unknown routes and 400 for non-JSON payload string", async () => {
    stub = await startMockCgwServer();
    const missing = await fetch(`${stub.baseUrl}/api/v2/nope`, {
      headers: { "x-api-key": stub.apiKey },
    });
    expect(missing.status).toBe(404);

    const badPayload = await fetch(`${stub.baseUrl}/api/v2/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": stub.apiKey,
      },
      body: JSON.stringify({
        fqcn: MOCK_CGW_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        topicVersion: "1.0.0",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        payload: "{not-json",
      }),
    });
    expect(badPayload.status).toBe(400);
  });

  it("filters receive by topicName and amount", async () => {
    stub = await startMockCgwServer({ validateTopics: false });
    stub.inject({
      fqcn: MOCK_CGW_COMMAND_FQCN,
      topicName: "billingCommandRequest",
      payload: { a: 1 },
    });
    stub.inject({
      fqcn: MOCK_CGW_REPLY_FQCN,
      topicName: "billingCommandReply",
      payload: { b: 2 },
    });
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-test",
    });
    const onlyReply = await client.receive({
      fqcn: MOCK_CGW_REPLY_FQCN,
      topicName: "billingCommandReply",
      amount: 1,
    });
    expect(onlyReply).toHaveLength(1);
    expect(onlyReply[0]!.topicName).toBe("billingCommandReply");
  });
});
