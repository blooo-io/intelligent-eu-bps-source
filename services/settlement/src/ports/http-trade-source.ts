import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
import type { UnbilledTrade } from "../domain/types.js";
import type { TradeSourcePort } from "./trade-source.port.js";

type TradeIntakeDto = {
  tradeId?: string;
  consumerId?: string;
  producerId?: string;
  communityId?: string;
  kWh?: string | number;
  price?: string | number;
  pricePerKWhEur?: string | number;
};

/**
 * INT-232 — HTTP client of AC-04 GetUnbilledTrades + MarkTradesBilled.
 * Selected when TRADE_INTAKE_INTERNAL_URL is set.
 */
export class HttpTradeSource implements TradeSourcePort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getUnbilled(
    communityId: string,
    until: string,
  ): Promise<UnbilledTrade[]> {
    const url = new URL(
      `${this.baseUrl.replace(/\/$/, "")}/internal/v1/trades/unbilled`,
    );
    url.searchParams.set("communityId", communityId);
    url.searchParams.set("until", until);
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-05-settlement", this.auth)),

      },
    });
    if (!res.ok) {
      throw new Error(
        `trade-intake getUnbilled ${communityId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as TradeIntakeDto[];
    if (!Array.isArray(body)) {
      return [];
    }
    return body
      .filter(
        (t) =>
          typeof t.tradeId === "string" &&
          typeof t.consumerId === "string" &&
          typeof t.producerId === "string",
      )
      .map((t) => ({
        tradeId: String(t.tradeId),
        consumerId: String(t.consumerId),
        producerId: String(t.producerId),
        communityId: String(t.communityId ?? communityId),
        kWh: Number(t.kWh ?? 0),
        pricePerKWhEur: Number(t.pricePerKWhEur ?? t.price ?? 0),
      }));
  }

  async markBilled(tradeIds: string[]): Promise<void> {
    if (tradeIds.length === 0) {
      return;
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/trades:mark-billed`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-05-settlement", this.auth)),

        "Content-Type": "application/json",

      },
      body: JSON.stringify({ tradeIds }),
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(
        `trade-intake markBilled failed with ${res.status}`,
      );
    }
  }

  async resetBilled(): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/trades:reset-billed`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-05-settlement", this.auth)),
      },
    });
    if (!res.ok) {
      throw new Error(
        `trade-intake resetBilled failed with ${res.status}`,
      );
    }
  }
}
