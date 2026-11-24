import type {
  PaymentMethodStats,
  PaymentProjection,
} from "../domain/types.js";

/**
 * Pure aggregation for GET /reports/payment-methods (REQ-046 / TE-2 / ER1.4).
 * Groups by method and fee currency; fees summed in minor units with
 * round_half_up averages over fee-bearing succeeded payments only.
 */

/** Median of a numeric sample; null when empty. Even length averages the two middle values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  // Even — average of the two central values; keep integer when exact.
  const avg = (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Number.isInteger(avg) ? avg : roundHalfUp(avg);
}

/**
 * Aggregate payment projections into per-method KPI rows.
 * Caller selects payments whose invoice projection matches the report period.
 * Grouping: `method ?? "unknown"` × `feeCurrency ?? payment.currency` (community currency).
 */
export function buildPaymentMethodReport(
  payments: PaymentProjection[],
): PaymentMethodStats[] {
  type Acc = {
    method: string;
    feeCurrency: string;
    count: number;
    succeededCount: number;
    failedCount: number;
    pendingCount: number;
    processingTimes: number[];
    feeMinorTotal: number;
    feeBearingCount: number;
    feeMissingCount: number;
  };

  const groups = new Map<string, Acc>();

  for (const pay of payments) {
    const method = pay.method ?? "unknown";
    // feeCurrency falls back to the payment/community currency (ER1.4).
    const feeCurrency = pay.feeCurrency ?? pay.currency;
    const key = `${method}\0${feeCurrency}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        method,
        feeCurrency,
        count: 0,
        succeededCount: 0,
        failedCount: 0,
        pendingCount: 0,
        processingTimes: [],
        feeMinorTotal: 0,
        feeBearingCount: 0,
        feeMissingCount: 0,
      };
      groups.set(key, acc);
    }
    acc.count += 1;

    if (pay.status === "succeeded") {
      acc.succeededCount += 1;
      if (pay.processingTimeMs !== undefined) {
        acc.processingTimes.push(pay.processingTimeMs);
      }
      if (pay.feeAmount !== undefined && pay.feeAmount !== "") {
        acc.feeMinorTotal += toMinor(pay.feeAmount);
        acc.feeBearingCount += 1;
      } else {
        // Succeeded without a projected fee — counted separately from the average.
        acc.feeMissingCount += 1;
      }
    } else if (pay.status === "failed") {
      acc.failedCount += 1;
    } else if (
      pay.status === "pending" ||
      pay.status === "requires_action"
    ) {
      acc.pendingCount += 1;
    }
  }

  const rows: PaymentMethodStats[] = [...groups.values()].map((acc) => {
    const decided = acc.succeededCount + acc.failedCount;
    const successRate =
      decided === 0
        ? null
        : Math.round((acc.succeededCount / decided) * 10_000) / 10_000;
    const averageFee =
      acc.feeBearingCount === 0
        ? null
        : fromMinor(roundHalfUp(acc.feeMinorTotal / acc.feeBearingCount));
    return {
      method: acc.method,
      feeCurrency: acc.feeCurrency,
      count: acc.count,
      succeededCount: acc.succeededCount,
      failedCount: acc.failedCount,
      pendingCount: acc.pendingCount,
      successRate,
      medianProcessingTimeMs: median(acc.processingTimes),
      totalFee: fromMinor(acc.feeMinorTotal),
      averageFee,
      feeMissingCount: acc.feeMissingCount,
    };
  });

  rows.sort((a, b) =>
    a.method === b.method
      ? a.feeCurrency.localeCompare(b.feeCurrency)
      : a.method.localeCompare(b.method),
  );
  return rows;
}

/** Money string → integer minor units (EUR/CHF = 2 decimals). */
function toMinor(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function fromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Round half up to nearest integer (positive fee averages). */
function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}
