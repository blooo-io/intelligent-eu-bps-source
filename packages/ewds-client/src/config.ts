import type { CgwConfig } from "./cgw-client.js";

export type AdapterMode = "mock" | "ewds";

const ADAPTER_KEYS = [
  "MARKET_ADAPTER",
  "DATASPACE_ADAPTER",
  "ACTOR_SOURCE_ADAPTER",
  "ERASURE_SOURCE_ADAPTER",
  "TARIFF_ADAPTER",
] as const;

export type AdapterEnvKey = (typeof ADAPTER_KEYS)[number];

export function adapterMode(
  env: NodeJS.ProcessEnv,
  key: AdapterEnvKey,
): AdapterMode {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return "mock";
  const mode = raw.trim().toLowerCase();
  if (mode === "mock" || mode === "ewds") return mode;
  throw new Error(`${key} must be mock or ewds`);
}

/**
 * DDHub CGW rejects clientId values with non-alphanumeric characters
 * (`clientId contains invalid characters`). Keep a stable per-pod id by
 * stripping separators from `${prefix}-${HOSTNAME}` (INT-439 / NFR-017).
 */
export function sanitizeCgwClientId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (!cleaned) {
    throw new Error("CGW clientId must contain at least one alphanumeric character");
  }
  return cleaned;
}

export function loadCgwConfig(env: NodeJS.ProcessEnv, service: string): CgwConfig {
  const baseUrl = env.CGW_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("CGW_BASE_URL is required");
  }
  const apiKey = env.CGW_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CGW_API_KEY is required");
  }
  const prefix = env.CGW_CLIENT_ID_PREFIX?.trim() ?? service;
  const host = env.HOSTNAME?.trim() ?? "0";
  return {
    baseUrl,
    apiKey,
    // INT-439 — CGW charset is [A-Za-z0-9] only; hyphens from k8s hostnames fail validation.
    clientId: sanitizeCgwClientId(`${prefix}-${host}`),
  };
}