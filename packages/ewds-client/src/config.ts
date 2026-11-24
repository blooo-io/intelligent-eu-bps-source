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
    clientId: `${prefix}-${host}`,
  };
}