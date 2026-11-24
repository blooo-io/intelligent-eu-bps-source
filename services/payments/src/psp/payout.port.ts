/** Payout port (WS5 Task 5.2 / INT-424). REQ-015 — consumed by WS1. */

import type { PspFailureCategory } from "./psp.types.js";

export type PayoutResult = {
  pspPayoutRef: string;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  arrivalDate?: string;
  failureCategory?: PspFailureCategory;
};

export interface PayoutPort {
  setManualSchedule(accountRef: string): Promise<void>;
  getAvailableBalance(
    accountRef: string,
    currency: string,
  ): Promise<{ amount: string; currency: string }>;
  createPayout(
    accountRef: string,
    amount: string,
    currency: string,
    idempotencyKey: string,
  ): Promise<PayoutResult>;
}

export const PAYOUT_PORT = Symbol("PAYOUT_PORT");
