import { createEwdsErasureRequest } from "../ports/ewds-erasure-request.adapter.js";
import { MockErasureRequestAdapter } from "./mock-erasure-request.adapter.js";

/**
 * REQ-013 / Task 3.22 — inbound erasure requests from the EWDS (P-ERASURE-REQ).
 * V1 selects mock | ewds | none by env (`ERASURE_SOURCE_ADAPTER` or
 * legacy `ERASURE_REQUEST_SOURCE`).
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
 * `ERASURE_SOURCE_ADAPTER` / `ERASURE_REQUEST_SOURCE` = mock|ewds|none
 * (default none for local; chart default is mock).
 */
export function createErasureRequestPort(
  env: NodeJS.ProcessEnv = process.env,
): ErasureRequestPort {
  const source = (
    env.ERASURE_SOURCE_ADAPTER ??
    env.ERASURE_REQUEST_SOURCE ??
    "none"
  )
    .trim()
    .toLowerCase();
  if (source === "mock") {
    return new MockErasureRequestAdapter();
  }
  if (source === "ewds") {
    return createEwdsErasureRequest(env);
  }
  return new NoneErasureRequestAdapter();
}
