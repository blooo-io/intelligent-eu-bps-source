import { Injectable, NotFoundException } from "@nestjs/common";
import type { FxPort } from "@intelligent/mocks";
import { createV1FxPort, formatRate } from "../fx/fx-adapter.js";

export type ExchangeRateDto = {
  currency: string;
  date: string;
  rate: string;
  source: string;
};

/**
 * GetRate / FetchRates for AC-13 (contracts/openapi/internal/reference-data.v1.yaml).
 * BR-08: amounts/rates on the wire use two decimal places.
 */
@Injectable()
export class RatesService {
  private fx: FxPort = createV1FxPort();

  /** Test seam — swap the P-FX port without Nest DI tokens. */
  useFxPort(fx: FxPort): void {
    this.fx = fx;
  }

  getRate(currency: string, date: string): ExchangeRateDto {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new NotFoundException(`Unknown currency ${currency}`);
    }
    if (currency === "EUR") {
      return {
        currency: "EUR",
        date,
        rate: "1.00",
        source: "identity",
      };
    }
    try {
      const quote = this.fx.getRate(currency, date);
      return {
        currency: quote.targetCurrency,
        date: quote.rateDate,
        rate: formatRate(quote.rate),
        source: quote.source,
      };
    } catch {
      throw new NotFoundException(`No rate for ${currency} on ${date}`);
    }
  }

  /** Reload fixture for a business day (AC-14 calls this). Returns 202 at HTTP layer. */
  fetchRates(date: string): { date: string; accepted: true } {
    // V1 fixture is static; refresh re-binds the same ECB table for the date.
    this.fx = createV1FxPort();
    void date;
    return { date, accepted: true };
  }
}
