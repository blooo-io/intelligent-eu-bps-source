/**
 * INT-441 — in-process DDHub CGW stub for protocol + command-channel tests.
 *
 * Speaks the same REST subset as {@link CgwClient} (`/api/v2/messages`,
 * ack, identity, `x-api-key`) without mTLS, EWAG topiccreator, or Spine.
 * Use as the stand-in for [CGW Blooo → BPS] while grants are pending (A8).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createTopicValidator, type EwdsTopicName } from "./topic-validator.js";
import type { CgwMessage } from "./cgw-client.js";

const validateRequest = createTopicValidator("billingCommandRequest");
const validateReply = createTopicValidator("billingCommandReply");

export type MockCgwQueued = {
  id: string;
  fqcn: string;
  topicName: string;
  topicOwner: string;
  topicVersion: string;
  transactionId: string | null;
  /** JSON string — same wire shape as the real CGW. */
  payload: string;
  sender: string;
  signatureValid: boolean;
  timestampNanos: number;
  acked: boolean;
};

export type MockCgwServerOpts = {
  /** DID returned by GET /api/v2/identity (sender on injected messages). */
  gatewayDid?: string;
  apiKey?: string;
  /** When true, reject command topic posts that fail JSON Schema. */
  validateTopics?: boolean;
};

export type MockCgwListen = {
  baseUrl: string;
  apiKey: string;
  gatewayDid: string;
  close: () => Promise<void>;
  /** Direct queue access for assertions (test-only). */
  queue: () => readonly MockCgwQueued[];
  /**
   * Inject a message as if a peer CGW published it (Project UI side).
   * Validates billingCommandRequest / Reply when topic matches.
   */
  inject: (input: {
    fqcn: string;
    topicName: string;
    topicOwner?: string;
    topicVersion?: string;
    transactionId?: string;
    payload: unknown;
    sender?: string;
  }) => { messageId: string; validationErrors: string[] };
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function unauthorized(res: ServerResponse): void {
  json(res, 401, { statusCode: 401, message: "Unauthorized" });
}

function topicErrors(
  topicName: string,
  payload: unknown,
  validateTopics: boolean,
): string[] {
  if (!validateTopics) return [];
  if (topicName === "billingCommandRequest") {
    return validateRequest(payload).errors;
  }
  if (topicName === "billingCommandReply") {
    return validateReply(payload).errors;
  }
  // Other topics: optional — only command channel is in scope for INT-441.
  return [];
}

/**
 * Start a loopback Mock CGW. Call {@link MockCgwListen.close} in afterEach.
 */
export async function startMockCgwServer(
  opts: MockCgwServerOpts = {},
): Promise<MockCgwListen> {
  const apiKey = opts.apiKey ?? "test-cgw-api-key";
  const gatewayDid =
    opts.gatewayDid ??
    "did:ethr:volta:0xMockCgwBlooo00000000000000000000000001";
  const validateTopics = opts.validateTopics !== false;
  const messages: MockCgwQueued[] = [];

  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const key = req.headers["x-api-key"];
      if (key !== apiKey) {
        unauthorized(res);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/v2/identity") {
        json(res, 200, {
          balance: "OK",
          enrolment: { did: gatewayDid, roles: [] },
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/v2/messages") {
        const fqcn = url.searchParams.get("fqcn") ?? "";
        const topicName = url.searchParams.get("topicName") ?? undefined;
        const amount = Number(url.searchParams.get("amount") ?? "10") || 10;
        const rows = messages
          .filter(
            (m) =>
              !m.acked &&
              m.fqcn === fqcn &&
              (topicName === undefined || m.topicName === topicName),
          )
          .slice(0, amount)
          .map(
            (m): CgwMessage => ({
              id: m.id,
              topicName: m.topicName,
              topicOwner: m.topicOwner,
              topicVersion: m.topicVersion,
              transactionId: m.transactionId,
              payload: m.payload,
              sender: m.sender,
              signatureValid: m.signatureValid,
              timestampNanos: m.timestampNanos,
            }),
          );
        json(res, 200, rows);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/v2/messages") {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as {
          fqcn?: string;
          topicName?: string;
          topicVersion?: string;
          topicOwner?: string;
          transactionId?: string;
          payload?: string;
        };
        let parsed: unknown = body.payload;
        if (typeof body.payload === "string") {
          try {
            parsed = JSON.parse(body.payload);
          } catch {
            json(res, 400, {
              statusCode: 400,
              message: "payload must be JSON-stringified object",
            });
            return;
          }
        }
        const errors = topicErrors(
          String(body.topicName ?? ""),
          parsed,
          validateTopics,
        );
        if (errors.length > 0) {
          json(res, 400, {
            statusCode: 400,
            message: "topic schema validation failed",
            errors,
          });
          return;
        }
        const id = randomUUID();
        messages.push({
          id,
          fqcn: String(body.fqcn ?? ""),
          topicName: String(body.topicName ?? ""),
          topicOwner: String(body.topicOwner ?? ""),
          topicVersion: String(body.topicVersion ?? "1.0.0"),
          transactionId:
            body.transactionId == null ? null : String(body.transactionId),
          payload:
            typeof body.payload === "string"
              ? body.payload
              : JSON.stringify(parsed ?? {}),
          sender: gatewayDid,
          signatureValid: true,
          timestampNanos: Date.now() * 1e6,
          acked: false,
        });
        json(res, 201, {
          clientGatewayMessageId: id,
          recipients: { sent: 1, failed: 0, total: 1 },
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/v2/messages/ack") {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { messageIds?: string[] };
        const ids = new Set(body.messageIds ?? []);
        for (const m of messages) {
          if (ids.has(m.id)) m.acked = true;
        }
        json(res, 200, { acked: ids.size });
        return;
      }

      json(res, 404, { statusCode: 404, message: `No route ${req.method} ${url.pathname}` });
    } catch (err) {
      json(res, 500, {
        statusCode: 500,
        message: err instanceof Error ? err.message : "stub error",
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("MockCgwServer failed to bind");
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    apiKey,
    gatewayDid,
    queue: () => messages,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    inject(input) {
      const errors = topicErrors(
        input.topicName,
        input.payload,
        validateTopics,
      );
      if (errors.length > 0) {
        return { messageId: "", validationErrors: errors };
      }
      const id = randomUUID();
      messages.push({
        id,
        fqcn: input.fqcn,
        topicName: input.topicName,
        topicOwner: input.topicOwner ?? "integration.apps.intelligent.auth.ewc",
        topicVersion: input.topicVersion ?? "1.0.0",
        transactionId: input.transactionId ?? null,
        payload: JSON.stringify(input.payload),
        sender: input.sender ?? gatewayDid,
        signatureValid: true,
        timestampNanos: Date.now() * 1e6,
        acked: false,
      });
      return { messageId: id, validationErrors: [] };
    },
  };
}

/** Topics the stub can schema-check today (INT-441 command channel). */
export const MOCK_CGW_VALIDATED_TOPICS: readonly EwdsTopicName[] = [
  "billingCommandRequest",
  "billingCommandReply",
];
