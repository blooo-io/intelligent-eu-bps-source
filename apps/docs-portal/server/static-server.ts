import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static server for the developer API portal (INT-244).
 * Serves Redocly HTML + OpenAPI yaml; GET /health for probes.
 */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "application/yaml; charset=utf-8",
  ".yml": "application/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function resolvePort(envPort = process.env.PORT): number {
  const parsed = Number(envPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8080;
}

function defaultStaticRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "dist");
}

export function createStaticServer(
  staticRoot = process.env.STATIC_ROOT ?? defaultStaticRoot(),
): http.Server {
  return http.createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "/";

    if (req.method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
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

    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }

    const ext = path.extname(candidate);
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(candidate).pipe(res);
  });
}

export function listen(port = resolvePort()): http.Server {
  const server = createStaticServer();
  server.listen(port, "0.0.0.0");
  return server;
}
