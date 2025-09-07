import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, listen, resolvePort } from "./server.js";

/** Collect an HTTP response body from a Node IncomingMessage. */
function readBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });
}

describe("cd-smoke server (INT-156 / UAT path for NFR-005 packaging)", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;
  });

  it("answers GET /health with status ok", async () => {
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/health`, resolve).on("error", reject);
    });
    const body = await readBody(res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(body)).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown paths and non-GET methods", async () => {
    server = createServer();
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    const getRes = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/nope`, resolve).on("error", reject);
    });
    expect(getRes.statusCode).toBe(404);
    assert.equal(JSON.parse(await readBody(getRes)).error, "not_found");

    const postRes = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/health", method: "POST" },
        resolve,
      );
      req.on("error", reject);
      req.end();
    });
    expect(postRes.statusCode).toBe(404);
  });

  it("resolvePort prefers a positive PORT and falls back to 8080", () => {
    expect(resolvePort("9090")).toBe(9090);
    expect(resolvePort(undefined)).toBe(8080);
    expect(resolvePort("0")).toBe(8080);
    expect(resolvePort("nope")).toBe(8080);
  });

  it("listen binds an ephemeral port when asked", async () => {
    server = listen(0);
    await new Promise<void>((resolve) => {
      if (server!.listening) resolve();
      else server!.once("listening", () => resolve());
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    assert.ok(address.port > 0);
  });
});
