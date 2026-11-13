import {asString, resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
import type { InvoiceTradeLine, PairSettlementInput } from "../domain/types.js";

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
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getPairSettlement(settlementId: string): Promise<PairSettlementInput> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/settlements/${settlementId}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-06-invoicing", this.auth)),

      },
    });
    if (!res.ok) {
      throw new Error(
        `settlement getPairSettlement ${settlementId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as Record<string, unknown>;
    return {
      settlementId: asString(body.settlementId, settlementId),
      runId: asString(body.runId),
      consumerId: asString(body.consumerId),
      producerId: asString(body.producerId),
      tradeIds: Array.isArray(body.tradeIds)
        ? body.tradeIds.map(String)
        : [],
      lines: parseTradeLines(body.lines),
      ...(typeof body.carriedForwardIn === "string"
        ? { carriedForwardIn: body.carriedForwardIn }
        : {}),
      kWh: asString(body.kWh, "0"),
      energyAmount: asString(body.energyAmount, "0"),
      vat: asString(body.vat, "0"),
      currency: asString(body.currency, "EUR"),
      rate: asString(body.rate, "1.0000"),
      communityId: asString(body.communityId),
      ...(typeof body.rateDate === "string" ? { rateDate: body.rateDate } : {}),
      ...(typeof body.periodFrom === "string" ? { periodFrom: body.periodFrom } : {}),
      ...(typeof body.periodUntil === "string"
        ? { periodUntil: body.periodUntil }
        : {}),
      ...(body.settlementType === "periodic" ||
      body.settlementType === "early" ||
      body.settlementType === "final"
        ? { settlementType: body.settlementType }
        : {}),
      ...(typeof body.vatRate === "number" ? { vatRate: body.vatRate } : {}),
      ...(typeof body.producerStripeAccountId === "string"
        ? { producerStripeAccountId: body.producerStripeAccountId }
        : {}),
    };
  }
}

function parseTradeLines(value: unknown): InvoiceTradeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const line = item as Record<string, unknown>;
    if (typeof line.tradeId !== "string") return [];
    return [
      {
        tradeId: line.tradeId,
        ...(typeof line.deliveryStart === "string"
          ? { deliveryStart: line.deliveryStart }
          : {}),
        ...(typeof line.deliveryEnd === "string"
          ? { deliveryEnd: line.deliveryEnd }
          : {}),
        kWh: asString(line.kWh, "0.000"),
        pricePerKWh: asString(line.pricePerKWh, "0.00"),
        amount: asString(line.amount, "0.00"),
      },
    ];
  });
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
