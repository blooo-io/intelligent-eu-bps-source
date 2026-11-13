import { parsePeriod } from "../domain/period.js";
import type { BillingRunRecord, PairSettlementRecord } from "../domain/types.js";

/**
 * INT-376 / NFR-004 — GetPairSettlement body.
 * Period bounds come from the billing run. vatRate is the rate used when
 * the settlement was computed (BR-07), not the community's current rate.
 */
export function toPairSettlementBody(
  row: PairSettlementRecord,
  run: BillingRunRecord,
): Record<string, unknown> {
  const bounds = parsePeriod(run.period);
  return {
    settlementId: row.settlementId,
    runId: row.runId,
    communityId: run.communityId,
    consumerId: row.consumerId,
    producerId: row.producerId,
    tradeIds: row.tradeIds,
    lines: row.lines,
    kWh: row.kWh,
    energyAmount: row.energyAmount,
    vat: row.vat,
    currency: row.currency,
    rate: row.rate,
    rateDate: row.rateDate,
    carriedForwardIn: row.carriedForwardIn,
    carriedForwardOut: row.carriedForwardOut,
    period: run.period,
    settlementType: run.type,
    periodFrom: bounds.start.toISOString(),
    periodUntil: bounds.end.toISOString(),
    vatRate: row.vatRate ?? 0,
  };
}
