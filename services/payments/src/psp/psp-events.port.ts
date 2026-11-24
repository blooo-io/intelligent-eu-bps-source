/** PSP webhook / payout event ports (WS5 Task 5.2 / INT-424). NFR-015. */

import type { PspEvent } from "./psp.types.js";

export type PspEventVerification = { ok: false } | { ok: true; event: PspEvent };

export interface PspEventsPort {
  verifyEvent(rawBody: string, signature: string): PspEventVerification;
}

export const PSP_EVENTS_PORT = Symbol("PSP_EVENTS_PORT");

export interface PayoutEventsHandler {
  onPayoutEvent(event: PspEvent): Promise<void>;
}

export const PAYOUT_EVENTS_HANDLER = Symbol("PAYOUT_EVENTS_HANDLER");
export const PSP_ADAPTER = Symbol("PSP_ADAPTER");

