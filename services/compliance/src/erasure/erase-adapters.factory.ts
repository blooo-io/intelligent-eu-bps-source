import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import type { IdpPort } from "../idp/idp.port.js";
import { DelegatedProjectUiIdpEraseAdapter } from "../idp/delegated-project-ui-idp-erase.adapter.js";
import { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import type { PspErasePort } from "../psp/psp-erase.port.js";
import { HttpPspEraseAdapter } from "../psp/http-psp-erase.adapter.js";

/**
 * REQ-013 / Task 3.21 / INT-463 — select IdP and PSP erasure adapters.
 *
 * - IdP member erase is always **delegated to the project UI** (no Keycloak call from BPS).
 * - `ERASURE_ADAPTERS=mock` forces in-process mocks (PSP mock + delegated IdP).
 * - Otherwise PSP uses HTTP when `PAYMENTS_INTERNAL_URL` is set.
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
  const payments = env.PAYMENTS_INTERNAL_URL?.trim();
  const production = env.NODE_ENV === "production";
  const delegatedIdp = () => new DelegatedProjectUiIdpEraseAdapter();

  if (forced === "mock") {
    // INT-440 — in-process mocks never boot in cluster images.
    if (production) {
      throw new Error(
        "ERASURE_ADAPTERS=mock refused when NODE_ENV=production",
      );
    }
    return {
      idp: new MockIdpAdapter(),
      psp: new MockPspEraseAdapter(),
      mode: "mock",
    };
  }

  if (forced === "http") {
    if (!payments) {
      throw new Error(
        "ERASURE_ADAPTERS=http requires PAYMENTS_INTERNAL_URL",
      );
    }
    return {
      idp: delegatedIdp(),
      psp: new HttpPspEraseAdapter(payments),
      mode: "http",
    };
  }

  if (payments) {
    return {
      idp: delegatedIdp(),
      psp: new HttpPspEraseAdapter(payments),
      mode: "http",
    };
  }

  if (production) {
    throw new Error(
      "ERASURE_ADAPTERS=http (or PAYMENTS_INTERNAL_URL) required when NODE_ENV=production",
    );
  }

  return {
    idp: new MockIdpAdapter(),
    psp: new MockPspEraseAdapter(),
    mode: "mock",
  };
}
