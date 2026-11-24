/**
 * REQ-004 / A10.2 — community tariff for grid fee / levy / tax (P-TARIFF).
 * Unit prices are decimal strings (min 4 fraction digits).
 */
export type Tariff = {
  tariffId: string;
  communityId: string;
  currency: "EUR" | "CHF";
  /** Inclusive start (YYYY-MM-DD or RFC 3339). */
  validFrom: string;
  /** Exclusive end; null = open-ended. */
  validUntil: string | null;
  gridFeePerKWh: string;
  levyPerKWh: string;
  taxPerKWh: string;
  source: "mock" | "ewds";
};

export interface TariffPort {
  getTariff(communityId: string, at: string): Promise<Tariff | null>;
}

export const TARIFF_PORT = Symbol("TARIFF_PORT");

/** UAT-004 fixture community. */
export const UAT004_TARIFF_COMMUNITY_ID =
  "a2000000-0000-4000-8000-000000000004";
