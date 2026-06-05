import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http, { type Server } from "node:http";
import { createStaticServer, listen, resolvePort } from "./static-server.js";

describe("docs-portal static-server (INT-244)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    const s = server;
    server = undefined;
    await new Promise<void>((resolve, reject) =>
      s.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("defaults PORT to 8080", () => {
    expect(resolvePort(undefined)).toBe(8080);
    expect(resolvePort("0")).toBe(8080);
    expect(resolvePort("9090")).toBe(9090);
  });

  it("serves /health, static files, HEAD, 404 and 405", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "docs-portal-"));
    writeFileSync(path.join(root, "index.html"), "<html>ok</html>");
    writeFileSync(path.join(root, "public.v1.yaml"), "openapi: 3.1.0\n");
    server = createStaticServer(root);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("ok");

    const yaml = await fetch(`${base}/public.v1.yaml`);
    expect(yaml.status).toBe(200);
    expect(yaml.headers.get("content-type")).toMatch(/yaml/);

    const head = await fetch(`${base}/index.html`, { method: "HEAD" });
    expect(head.status).toBe(200);

    const missing = await fetch(`${base}/nope.html`);
    expect(missing.status).toBe(404);

    const badMethod = await fetch(`${base}/`, { method: "POST" });
    expect(badMethod.status).toBe(405);

    // fetch() normalises `..` away; use raw path so the server sees traversal.
    const escapeStatus = await new Promise<number>((resolve, reject) => {
      http
        .get({ hostname: "127.0.0.1", port, path: "/../../etc/passwd" }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on("error", reject);
    });
    expect(escapeStatus).toBe(403);
  });

  it("listen binds on the resolved port", async () => {
    process.env.STATIC_ROOT = mkdtempSync(path.join(tmpdir(), "docs-listen-"));
    writeFileSync(path.join(process.env.STATIC_ROOT, "index.html"), "x");
    server = listen(0);
    await new Promise<void>((resolve) => {
      if (server!.listening) resolve();
      else server!.once("listening", () => resolve());
    });
    const addr = server.address();
    expect(addr && typeof addr === "object" && addr.port).toBeTruthy();
    delete process.env.STATIC_ROOT;
  });

  it("uses the default dist root when STATIC_ROOT is unset", async () => {
    delete process.env.STATIC_ROOT;
    // defaultStaticRoot() points at apps/docs-portal/dist (built in CI / local build).
    server = createStaticServer();
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
  });
});

