import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Production static server for AC-01 (INT-137).
 * Serves Vite dist/, GET /health for probes, and /config.json from env.
 */

export type ServerEnv = {
  PORT?: string;
  OIDC_AUTHORITY?: string;
  OIDC_CLIENT_ID?: string;
  /** NFR-013 — dot-path of the roles claim, default realm_access.roles. */
  OIDC_ROLE_CLAIM?: string;
  API_BASE_URL?: string;
  /** OpenBao extract key (lowercase) or operator override. */
  stripe_publishable_key?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STATIC_ROOT?: string;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function resolvePort(envPort = process.env.PORT): number {
  const parsed = Number(envPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8080;
}

export function buildConfigJson(env: ServerEnv = process.env): string {
  const stripePublishableKey =
    env.stripe_publishable_key ?? env.STRIPE_PUBLISHABLE_KEY ?? "";
  return JSON.stringify({
    oidcAuthority:
      env.OIDC_AUTHORITY ?? "https://auth.intelligent-eu-bp.blooo.dev/realms/int",
    oidcClientId: env.OIDC_CLIENT_ID ?? "web",
    oidcRoleClaim: env.OIDC_ROLE_CLAIM?.trim() || "realm_access.roles",
    apiBaseUrl: env.API_BASE_URL ?? "https://api.dev.intelligent-eu-bp.blooo.dev",
    ...(stripePublishableKey
      ? { stripePublishableKey }
      : {}),
  });
}

function defaultStaticRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "dist");
}

export function createStaticServer(
  env: ServerEnv = process.env,
  staticRoot = env.STATIC_ROOT ?? defaultStaticRoot(),
): http.Server {
  return http.createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "/";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && url === "/config.json") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(buildConfigJson(env));
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }

    const relative = url === "/" ? "/index.html" : url;
    const candidate = path.normalize(path.join(staticRoot, relative));
    if (!candidate.startsWith(path.normalize(staticRoot))) {
      res.writeHead(403);
      res.end();
      return;
    }

    const filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(staticRoot, "index.html");

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
}

export function listen(
  port = resolvePort(),
  env: ServerEnv = process.env,
): http.Server {
  const server = createStaticServer(env);
  server.listen(port, "0.0.0.0");
  return server;
}
