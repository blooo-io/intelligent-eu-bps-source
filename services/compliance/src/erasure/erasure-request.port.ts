import { MockErasureRequestAdapter } from "./mock-erasure-request.adapter.js";

/**
 * REQ-013 / Task 3.22 — inbound erasure requests from the EWDS (P-ERASURE-REQ).
 * The real EWDS adapter lands in WS4; V1 selects mock | ewds | none by env.
 */

export type InboundErasureRequest = {
  externalRequestId: string;
  actorId: string;
  communityId: string;
  issuedBy: string;
  receivedAt: string;
};

export type ErasureOutcomeReport = {
  status: "completed" | "failed";
  requestId: string;
  invoicesRetainedUntil: string | null;
};

export interface ErasureRequestPort {
  onRequest(handler: (r: InboundErasureRequest) => Promise<void>): void;
  reportOutcome(
    externalRequestId: string,
    outcome: ErasureOutcomeReport,
  ): Promise<void>;
}

export const ERASURE_REQUEST_PORT = Symbol("ERASURE_REQUEST_PORT");

/** No-op when ERASURE_REQUEST_SOURCE is unset or `none` (default). */
export class NoneErasureRequestAdapter implements ErasureRequestPort {
  onRequest(_handler: (r: InboundErasureRequest) => Promise<void>): void {
    // intentionally empty — no EWDS feed in this mode
  }

  async reportOutcome(): Promise<void> {
    // intentionally empty
  }
}

/**
 * Select the erasure-request port.
 * `ERASURE_REQUEST_SOURCE=mock|ewds|none` (default none).
 * `ewds` is reserved for WS4; until then it throws so misconfiguration fails at boot.
 */
export function createErasureRequestPort(
  env: NodeJS.ProcessEnv = process.env,
): ErasureRequestPort {
  const source = (env.ERASURE_REQUEST_SOURCE ?? "none").trim().toLowerCase();
  if (source === "mock") {
    return new MockErasureRequestAdapter();
  }
  if (source === "ewds") {
    throw new Error(
      "ERASURE_REQUEST_SOURCE=ewds requires the WS4 EwdsErasureRequestAdapter (not yet wired)",
    );
  }
  return new NoneErasureRequestAdapter();
}
