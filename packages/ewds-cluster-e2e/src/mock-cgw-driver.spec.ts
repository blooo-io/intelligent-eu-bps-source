/**
 * INT-454 — driver unit tests (in-process Mock CGW) + optional live URL.
 *
 * When MOCK_CGW_BASE_URL is set (cluster port-forward), the same suite hits
 * the deployed stub. Otherwise it starts a loopback Mock CGW (CI box).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MOCK_CGW_GATEWAY_DID,
  startMockCgwServer,
  type MockCgwListen,
} from "@intelligent/ewds-client";
import {
  CLUSTER_COMMAND_FQCN,
  createMockCgwDriver,
  clusterActorInjects,
  clusterCommandInjects,
  RUN_PATH_MOCK,
  type MockCgwDriver,
} from "./mock-cgw-driver.js";

describe("ewds-cluster-e2e Mock CGW driver (INT-454)", () => {
  let stub: MockCgwListen | undefined;
  let driver: MockCgwDriver;

  beforeAll(async () => {
    const remote = process.env.MOCK_CGW_BASE_URL?.trim();
    if (remote) {
      driver = createMockCgwDriver(
        remote,
        process.env.MOCK_CGW_API_KEY?.trim() || "cluster-e2e-key",
      );
      return;
    }
    // CI / local: in-process stub with empty apiKey (same as cluster image).
    stub = await startMockCgwServer({
      host: "127.0.0.1",
      apiKey: "",
      gatewayDid: MOCK_CGW_GATEWAY_DID,
    });
    driver = createMockCgwDriver(stub.baseUrl, "any-non-empty-key");
  });

  afterAll(async () => {
    await stub?.close();
  });

  it("run_path is mock (transport stand-in, not live Spine)", () => {
    expect(RUN_PATH_MOCK).toBe("mock");
  });

  it("GET /health is ready", async () => {
    const health = await driver.health();
    expect(health.status).toBe("ok");
  });

  it("identity returns Mock CGW DID", async () => {
    const id = await driver.identity();
    expect(id.did).toBe(MOCK_CGW_GATEWAY_DID);
    expect(id.balance).toBe("OK");
  });

  it("S13: injects all 8 command ops onto production FQCN", async () => {
    const before = (await driver.queue()).length;
    const injects = clusterCommandInjects();
    expect(injects).toHaveLength(8);
    for (const row of injects) {
      const result = await driver.inject(row.body);
      expect(result.messageId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(row.body.fqcn).toBe(CLUSTER_COMMAND_FQCN);
    }
    const after = await driver.queue();
    expect(after.length).toBeGreaterThanOrEqual(before + 8);
    expect(
      after.filter((m) => m.fqcn === CLUSTER_COMMAND_FQCN && !m.acked).length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("S1: injects Actor fixtures onto actors.sub FQCN", async () => {
    const injects = clusterActorInjects();
    expect(injects.length).toBeGreaterThan(0);
    for (const row of injects) {
      const result = await driver.inject(row.body);
      expect(result.messageId).toBeTruthy();
    }
  });

  it("inject rejects invalid command payloads", async () => {
    await expect(
      driver.inject({
        fqcn: CLUSTER_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        payload: { not: "a command" },
      }),
    ).rejects.toThrow(/inject 400/);
  });

  it("strips trailing slash on baseUrl and accepts default apiKey", () => {
    const d = createMockCgwDriver(`${driver.baseUrl}/`);
    expect(d.baseUrl.endsWith("/")).toBe(false);
    expect(d.apiKey).toBe("cluster-e2e-key");
  });

  it("error paths: health / identity / queue / inject message fallback", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/health") {
        res.writeHead(503, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (url.startsWith("/api/v2/identity")) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (url.startsWith("/test/v1/queue")) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      if (url.startsWith("/test/v1/inject")) {
        res.writeHead(400, { "content-type": "application/json" });
        // No `message` → driver falls back to JSON.stringify(body).
        res.end(JSON.stringify({ errors: ["x"] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("bind failed");
    const bad = createMockCgwDriver(`http://127.0.0.1:${addr.port}`, "k");
    await expect(bad.health()).rejects.toThrow(/health 503/);
    await expect(bad.identity()).rejects.toThrow(/identity 401/);
    await expect(bad.queue()).rejects.toThrow(/queue 500/);
    await expect(
      bad.inject({
        fqcn: CLUSTER_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        payload: {},
      }),
    ).rejects.toThrow(/inject 400/);
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("clusterActorInjects accepts an explicit communityId", () => {
    const rows = clusterActorInjects("b1000000-0000-4000-8000-000000000099");
    expect(rows[0]?.body.payload).toMatchObject({
      communityId: "b1000000-0000-4000-8000-000000000099",
    });
  });
});
