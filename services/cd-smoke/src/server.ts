import http from "node:http";

/**
 * Minimal HTTP app for the factory CD smoke image (INT-156 / TD-11).
 * Product modules replace this with NestJS from packages/module-template;
 * the container contract stays the same: GET /health → 200.
 */
export function createServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
}

/** Resolve listen port from env; default 8080 matches the Helm chart probes. */
export function resolvePort(envPort = process.env.PORT): number {
  const parsed = Number(envPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8080;
}

/** Bind on all interfaces so Kubernetes probes reach the container. */
export function listen(port = resolvePort()): http.Server {
  const server = createServer();
  server.listen(port, "0.0.0.0");
  return server;
}
