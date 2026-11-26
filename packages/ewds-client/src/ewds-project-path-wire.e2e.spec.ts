/**
 * INT-453 — wire-level E2E: every EWDS topic example + command scenario validates.
 * Complements packages/ewds-project-path-e2e journey tests.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CgwClient } from "./cgw-client.js";
import {
  commandChannelScenarios,
  MOCK_CGW_COMMAND_FQCN,
  MOCK_CGW_REPLY_FQCN,
  MOCK_CGW_TOPIC_OWNER,
} from "./mock-cgw-scenarios.js";
import { startMockCgwServer, type MockCgwListen } from "./mock-cgw-server.js";
import { createTopicValidator, type EwdsTopicName } from "./topic-validator.js";

const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const docsRoot = path.resolve(pkgRoot, "../../docs/architecture/ewds-topics");

const recordTopics = [
  "actor",
  "billingStatement",
  "billingInvoice",
  "billingPayment",
  "billingPayout",
  "billingKycStatus",
] as const satisfies readonly EwdsTopicName[];

describe("INT-453 EWDS project-path wire E2E", () => {
  let stub: MockCgwListen | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  it("every packaged record topic example is schema-valid", async () => {
    for (const topic of recordTopics) {
      const example = JSON.parse(
        await readFile(path.join(docsRoot, `${topic}.example.json`), "utf8"),
      );
      const result = createTopicValidator(topic)(example);
      expect(result, `${topic} example`).toEqual({ ok: true, errors: [] });
    }
  });

  it("Mock CGW round-trips all eight command operations (S3/S4/S7–S11/S13 wire)", async () => {
    stub = await startMockCgwServer();
    const client = new CgwClient({
      baseUrl: stub.baseUrl,
      apiKey: stub.apiKey,
      clientId: "bps-e2e",
    });
    process.env.CGW_ACK_MODE = "fetch";

    const ops = new Set<string>();
    for (const scenario of commandChannelScenarios()) {
      ops.add(scenario.operation);
      const injected = stub.inject({
        fqcn: MOCK_CGW_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        transactionId: scenario.request.requestId,
        payload: scenario.request,
      });
      expect(injected.validationErrors).toEqual([]);
      await client.ack([injected.messageId]);
      await client.send({
        fqcn: MOCK_CGW_REPLY_FQCN,
        topicName: "billingCommandReply",
        topicVersion: "1.0.0",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        transactionId: scenario.reply.requestId,
        payload: scenario.reply,
      });
    }
    expect([...ops].sort()).toEqual(
      [
        "acceptTerms",
        "requestWithdrawal",
        "sendReminder",
        "setInvoiceStatus",
        "setupPaymentMethod",
        "startKyc",
        "startPayment",
        "triggerBillingRun",
      ].sort(),
    );
  });
});
