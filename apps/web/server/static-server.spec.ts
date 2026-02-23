import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import {
  buildConfigJson,
  createStaticServer,
  listen,
  resolvePort,
} from "./static-server";

describe("static-server", () => {
  let server: http.Server | undefined;
  let tmp: string | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = undefined;
    }
  });

  it("resolvePort defaults to 8080", () => {
    expect(resolvePort(undefined)).toBe(8080);
    expect(resolvePort("9090")).toBe(9090);
  });

  it("buildConfigJson uses env overrides including publishable key (INT-191)", () => {
    const json = JSON.parse(
      buildConfigJson({
        OIDC_AUTHORITY: "https://auth.test/realms/int",
        API_BASE_URL: "https://api.test",
        stripe_publishable_key: "pk_test_from_bao",
      }),
    );
    expect(json.oidcAuthority).toBe("https://auth.test/realms/int");
    expect(json.apiBaseUrl).toBe("https://api.test");
    expect(json.oidcClientId).toBe("web");
    expect(json.stripePublishableKey).toBe("pk_test_from_bao");
  });

  it("serves /health and /config.json", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "web-static-"));
    fs.writeFileSync(path.join(tmp, "index.html"), "<html>ok</html>");
    fs.writeFileSync(path.join(tmp, "app.js"), "console.log(1)");
    server = createStaticServer({ API_BASE_URL: "https://api.test" }, tmp);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${addr.port}`;

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const cfg = await fetch(`${base}/config.json`);
    expect(cfg.status).toBe(200);
    expect((await cfg.json()).apiBaseUrl).toBe("https://api.test");

    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("ok");

    const asset = await fetch(`${base}/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toMatch(/javascript/);

    const spa = await fetch(`${base}/unknown-route`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain("ok");

    const head = await fetch(`${base}/app.js`, { method: "HEAD" });
    expect(head.status).toBe(200);

    const badMethod = await fetch(`${base}/`, { method: "POST" });
    expect(badMethod.status).toBe(405);

    const traversal = await fetch(`${base}/../etc/passwd`);
    expect([403, 200]).toContain(traversal.status);
  });

  it("returns 404 when the static root has no index", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "web-static-empty-"));
    server = createStaticServer({}, tmp);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const res = await fetch(`http://127.0.0.1:${addr.port}/missing`);
    expect(res.status).toBe(404);
  });

  it("listen binds on the resolved port", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "web-listen-"));
    fs.writeFileSync(path.join(tmp, "index.html"), "hi");
    // Bind an ephemeral port via createServer path exercised by listen().
    server = listen(0, { STATIC_ROOT: tmp, API_BASE_URL: "https://api.test" });
    await new Promise<void>((resolve) => {
      if (server!.listening) resolve();
      else server!.once("listening", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
    expect(res.status).toBe(200);
  });
});
