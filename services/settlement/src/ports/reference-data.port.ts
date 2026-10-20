import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
/**
 * Narrow client of AC-13 GetVatRate / GetRate (BR-06 / BR-07 / REQ-002).
 */
export interface ReferenceDataPort {
  getVatRate(communityId: string): Promise<number>;
  getRate(currency: "EUR" | "CHF", date: string): Promise<number>;
}

export const REFERENCE_DATA_PORT = Symbol("REFERENCE_DATA_PORT");

/**
 * INT-272 — HTTP rates/VAT against AC-13.
 * Selected when REFERENCE_DATA_INTERNAL_URL is set (cluster).
 */
export class HttpReferenceData implements ReferenceDataPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getVatRate(communityId: string): Promise<number> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/communities/${communityId}/vat-rate`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-05-settlement", this.auth)),

      },
    });
    if (!res.ok) {
      throw new Error(
        `reference-data getVatRate ${communityId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as { vatRate?: string | number };
    return Number(body.vatRate ?? 0);
  }

  async getRate(currency: "EUR" | "CHF", date: string): Promise<number> {
    if (currency === "EUR") {
      return 1;
    }
    const url = new URL(
      `${this.baseUrl.replace(/\/$/, "")}/internal/v1/rates`,
    );
    url.searchParams.set("currency", currency);
    url.searchParams.set("date", date);
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-05-settlement", this.auth)),

      },
    });
    if (!res.ok) {
      throw new Error(
        `reference-data getRate ${currency} ${date} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as { rate?: string | number };
    return Number(body.rate ?? 1);
  }
}

export function createReferenceData(
  env: NodeJS.ProcessEnv = process.env,
): ReferenceDataPort | null {
  const base = env.REFERENCE_DATA_INTERNAL_URL;
  if (base) {
    return new HttpReferenceData(base);
  }
  return null;
}
