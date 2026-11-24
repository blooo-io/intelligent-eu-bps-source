import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import type { IdpPort } from "../idp/idp.port.js";
import { HttpIdpEraseAdapter } from "../idp/http-idp-erase.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import type { PspErasePort } from "../psp/psp-erase.port.js";
import { HttpPspEraseAdapter } from "../psp/http-psp-erase.adapter.js";

/**
 * REQ-013 / Task 3.21 — select IdP and PSP erasure adapters from the environment.
 *
 * - `ERASURE_ADAPTERS=mock` forces the in-process mocks.
 * - Otherwise `http` when `PARTICIPANTS_INTERNAL_URL` and `PAYMENTS_INTERNAL_URL` are both set.
 * - `ERASURE_ADAPTERS=http` with a URL missing throws at boot.
 */
export type EraseAdapters = {
  idp: IdpPort;
  psp: PspErasePort;
  mode: "http" | "mock";
};

export const ERASE_ADAPTERS = Symbol("ERASE_ADAPTERS");

export function createEraseAdapters(
  env: NodeJS.ProcessEnv = process.env,
): EraseAdapters {
  const forced = (env.ERASURE_ADAPTERS ?? "").trim().toLowerCase();
  const participants = env.PARTICIPANTS_INTERNAL_URL?.trim();
  const payments = env.PAYMENTS_INTERNAL_URL?.trim();

  if (forced === "mock") {
    return {
      idp: new MockIdpAdapter(),
      psp: new MockPspEraseAdapter(),
      mode: "mock",
    };
  }

  if (forced === "http") {
    if (!participants || !payments) {
      throw new Error(
        "ERASURE_ADAPTERS=http requires PARTICIPANTS_INTERNAL_URL and PAYMENTS_INTERNAL_URL",
      );
    }
    return {
      idp: new HttpIdpEraseAdapter(participants),
      psp: new HttpPspEraseAdapter(payments),
      mode: "http",
    };
  }

  if (participants && payments) {
    return {
      idp: new HttpIdpEraseAdapter(participants),
      psp: new HttpPspEraseAdapter(payments),
      mode: "http",
    };
  }

  return {
    idp: new MockIdpAdapter(),
    psp: new MockPspEraseAdapter(),
    mode: "mock",
  };
}
