/**
 * INT-317 — mint Keycloak module-service client-credentials JWT for scripts
 * that call Nest `/internal/*` when SERVICE_JWT_REQUIRED=true (INT-314).
 *
 * Env (defaults match V1 virtual Keycloak seed):
 *   KEYCLOAK_BASE_URL
 *   KEYCLOAK_REALM                 (default int)
 *   KEYCLOAK_SERVICE_CLIENT_ID     (default module-service)
 *   KEYCLOAK_SERVICE_CLIENT_SECRET (default dev-module-service-replace-me)
 *   KEYCLOAK_TOKEN_HOST            (optional; legacy Host override — obsolete for iss
 *                                  once KC_HOSTNAME / KEYCLOAK_ISSUER are public, INT-348)
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export const DEFAULT_MODULE_SERVICE_CLIENT = {
  clientId: "module-service",
  secret: "dev-module-service-replace-me",
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   baseUrl: string,
 *   realm: string,
 *   clientId: string,
 *   clientSecret: string,
 *   tokenHost: string | null,
 * } | null}
 */
export function resolveServiceJwtEnv(env = process.env) {
  const baseUrl = (env.KEYCLOAK_BASE_URL ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    return null;
  }
  // Legacy: force Host on port-forward mint. With KC_HOSTNAME (INT-345) iss is
  // always the public URL; Nest matches via KEYCLOAK_ISSUER (INT-348).
  const tokenHost = (env.KEYCLOAK_TOKEN_HOST ?? "").trim() || null;
  return {
    baseUrl,
    realm: env.KEYCLOAK_REALM || "int",
    clientId:
      env.KEYCLOAK_SERVICE_CLIENT_ID || DEFAULT_MODULE_SERVICE_CLIENT.clientId,
    clientSecret:
      env.KEYCLOAK_SERVICE_CLIENT_SECRET || DEFAULT_MODULE_SERVICE_CLIENT.secret,
    tokenHost,
  };
}

/**
 * Undici/fetch ignores a custom `Host` header. When KEYCLOAK_TOKEN_HOST is set
 * (kubectl port-forward), use node:http so Nest's issuer check matches cluster DNS.
 *
 * @param {string} tokenUrl
 * @param {Record<string, string>} headers
 * @param {string} body
 * @returns {Promise<{ status: number, json: unknown }>}
 */
export function postFormWithHost(tokenUrl, headers, body) {
  const url = new URL(tokenUrl);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          ...headers,
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * @param {{
 *   baseUrl: string,
 *   realm: string,
 *   clientId: string,
 *   clientSecret: string,
 *   tokenHost?: string | null,
 * }} cfg
 * @param {typeof fetch} [fetchImpl] ignored when tokenHost is set (Host must stick)
 */
export async function mintServiceAccessToken(cfg, fetchImpl = fetch) {
  const tokenUrl = `${cfg.baseUrl}/realms/${cfg.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  }).toString();

  if (cfg.tokenHost) {
    const { status, json } = await postFormWithHost(
      tokenUrl,
      {
        "content-type": "application/x-www-form-urlencoded",
        Host: cfg.tokenHost,
        "X-Forwarded-Host": cfg.tokenHost,
        "X-Forwarded-Proto": "http",
      },
      body,
    );
    if (status < 200 || status >= 300) {
      throw new Error(`service_token_http_${status}`);
    }
    if (
      !json ||
      typeof json !== "object" ||
      typeof /** @type {{ access_token?: unknown }} */ (json).access_token !==
        "string"
    ) {
      throw new Error("service_token_missing_access_token");
    }
    return /** @type {{ access_token: string }} */ (json).access_token;
  }

  const res = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`service_token_http_${res.status}`);
  }
  const json = await res.json();
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("service_token_missing_access_token");
  }
  return json.access_token;
}

/**
 * Forgeable headers + Bearer when Keycloak is configured.
 * @param {{ sub?: string, roles?: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [opts]
 */
export async function buildInternalServiceHeaders(opts = {}) {
  const env = opts.env ?? process.env;
  const headers = {
    "content-type": "application/json",
    "x-intelligent-roles": opts.roles ?? "service,operator",
    "x-intelligent-sub": opts.sub ?? "script-service",
    "x-intelligent-token-use": "service",
  };
  const cfg = resolveServiceJwtEnv(env);
  if (!cfg) {
    return headers;
  }
  const token = await mintServiceAccessToken(cfg, opts.fetchImpl);
  headers.Authorization = `Bearer ${token}`;
  return headers;
}
