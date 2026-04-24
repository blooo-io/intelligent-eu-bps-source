import type { PairSettlementInput } from "../domain/types.js";

export const SETTLEMENT_CLIENT = Symbol("SETTLEMENT_CLIENT");

/** Narrow client of AC-05 GetPairSettlement (INT-223). */
export type SettlementClientPort = {
  getPairSettlement(settlementId: string): Promise<PairSettlementInput>;
};

/** No-op / CI — throws so accidental use fails loudly. */
export class UnconfiguredSettlementClient implements SettlementClientPort {
  async getPairSettlement(settlementId: string): Promise<PairSettlementInput> {
    throw new Error(
      `SETTLEMENT_INTERNAL_URL unset; cannot hydrate settlement ${settlementId}`,
    );
  }
}

/**
 * HTTP bridge to AC-05 internal GetPairSettlement.
 * Headers match V1 service-principal middleware (x-intelligent-roles).
 */
export class HttpSettlementClient implements SettlementClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getPairSettlement(settlementId: string): Promise<PairSettlementInput> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/settlements/${settlementId}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-06-invoicing",
      },
    });
    if (!res.ok) {
      throw new Error(
        `settlement getPairSettlement ${settlementId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as Record<string, unknown>;
    return {
      settlementId: String(body.settlementId ?? settlementId),
      runId: String(body.runId ?? ""),
      consumerId: String(body.consumerId ?? ""),
      producerId: String(body.producerId ?? ""),
      tradeIds: Array.isArray(body.tradeIds)
        ? body.tradeIds.map(String)
        : [],
      kWh: String(body.kWh ?? "0"),
      energyAmount: String(body.energyAmount ?? "0"),
      vat: String(body.vat ?? "0"),
      currency: String(body.currency ?? "EUR"),
      rate: String(body.rate ?? "1"),
      communityId: String(body.communityId ?? ""),
      ...(typeof body.producerStripeAccountId === "string"
        ? { producerStripeAccountId: body.producerStripeAccountId }
        : {}),
    };
  }
}

export function createSettlementClient(
  env: NodeJS.ProcessEnv = process.env,
): SettlementClientPort {
  const base = env.SETTLEMENT_INTERNAL_URL;
  if (base) {
    return new HttpSettlementClient(base);
  }
  return new UnconfiguredSettlementClient();
}
