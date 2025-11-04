import { Injectable, NotFoundException } from "@nestjs/common";

export type VatRateDto = {
  communityId: string;
  vatRate: string;
};

/**
 * GetVatRate for AC-13 (BR-07 — community VAT, 0 by default).
 * Community settings will later come from AC-03; V1 seats known fixture communities.
 */
@Injectable()
export class VatService {
  private readonly rates = new Map<string, string>();

  constructor() {
    // Default for the V1 virtual community used in mock scenarios (BR-07 → 0.00).
    this.rates.set("c0ffee00-1234-4abc-8def-0123456789ab", "0.00");
  }

  getVatRate(communityId: string): VatRateDto {
    const vatRate = this.rates.get(communityId);
    if (vatRate === undefined) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    return { communityId, vatRate };
  }

  /** Test / bootstrap helper — not exposed on the public surface. */
  setVatRate(communityId: string, vatRate: string): void {
    this.rates.set(communityId, vatRate);
  }
}
