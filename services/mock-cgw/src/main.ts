/**
 * INT-454 — cluster entrypoint for Mock CGW.
 *
 * Binds 0.0.0.0:PORT so destinDev pods can reach the stub via Service DNS.
 * Empty CGW_API_KEY accepts any non-empty x-api-key (modules send OpenBao key).
 */
import {
  MOCK_CGW_GATEWAY_DID,
  startMockCgwServer,
} from "@intelligent/ewds-client";
import { isDirectRun, resolvePort } from "./port.js";

export async function main(): Promise<void> {
  const port = resolvePort();
  // Cluster mode: empty key → accept OpenBao keys from ewdsClient modules.
  const apiKey = process.env.CGW_API_KEY ?? "";
  const gatewayDid = process.env.MOCK_CGW_GATEWAY_DID ?? MOCK_CGW_GATEWAY_DID;
  const listen = await startMockCgwServer({
    host: "0.0.0.0",
    port,
    apiKey,
    gatewayDid,
    validateTopics: process.env.MOCK_CGW_VALIDATE_TOPICS !== "false",
  });
  // Identifiers only — no personal data (NFR-015).
  console.log(
    JSON.stringify({
      msg: "mock-cgw listening",
      port,
      gatewayDid: listen.gatewayDid,
      run_path: "mock",
    }),
  );
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  void main();
}
