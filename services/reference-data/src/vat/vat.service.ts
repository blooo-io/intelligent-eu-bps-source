import { Injectable } from "@nestjs/common";

export type VatRateDto = {
  communityId: string;
  vatRate: string;
};

/** S1 demo community (manual journey / money-path). */
const S1_COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
/** UAT IdP community (e2e-dev hugo.petit / sofia.garcia). */
const UAT_COMMUNITY_ID = "a1000000-0000-4000-8000-000000000001";

/**
 * GetVatRate for AC-13 (BR-07 — community VAT, 0 by default).
 * INT-279 — unknown communities return 0.00 (do not 404); StartRun depends on this.
 */
@Injectable()
export class VatService {
  private readonly rates = new Map<string, string>();

  constructor() {
    // Explicit fixture seats (same default as unknown communities).
    this.rates.set(S1_COMMUNITY_ID, "0.00");
    this.rates.set(UAT_COMMUNITY_ID, "0.00");
  }

  getVatRate(communityId: string): VatRateDto {
    // BR-07 / REQ-007 — rate configurable per community, 0 by default.
    const vatRate = this.rates.get(communityId) ?? "0.00";
    return { communityId, vatRate };
  }

  /** Test / bootstrap helper — not exposed on the public surface. */
  setVatRate(communityId: string, vatRate: string): void {
    this.rates.set(communityId, vatRate);
  }
}
