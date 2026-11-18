/**
 * Public-operation coverage for the deployed-stack API e2e (INT-394 / REQ-052).
 * An operation counts only when the live call returned a status the suite
 * accepts for it. The suite fails unless every public operationId is covered.
 */

export type OperationCall = {
  operationId: string;
  status: number;
};

export type OperationCoverage = {
  total: number;
  covered: number;
  /** One decimal, so 33/33 is 100 and a single miss is not rounded up to 100. */
  percent: number;
  missing: string[];
  unexpected: string[];
  calls: OperationCall[];
};

export function operationCoverage(
  expected: readonly string[],
  calls: readonly OperationCall[],
  accepted: Readonly<Record<string, readonly number[]>>,
): OperationCoverage {
  const seen = new Map<string, OperationCall>();
  const unexpected: string[] = [];
  const known = new Set(expected);
  for (const call of calls) {
    if (!known.has(call.operationId)) {
      unexpected.push(call.operationId);
      continue;
    }
    seen.set(call.operationId, call);
  }
  const missing: string[] = [];
  for (const id of expected) {
    const call = seen.get(id);
    const ok = call !== undefined && (accepted[id] ?? []).includes(call.status);
    if (!ok) missing.push(id);
  }
  const covered = expected.length - missing.length;
  const percent =
    expected.length === 0
      ? 100
      : Math.floor((covered / expected.length) * 1000) / 10;
  return {
    total: expected.length,
    covered,
    percent,
    missing,
    unexpected,
    calls: expected
      .map((id) => seen.get(id))
      .filter((call): call is OperationCall => call !== undefined),
  };
}

/** Throws when coverage is short of the public contract. */
export function assertFullOperationCoverage(report: OperationCoverage): void {
  if (
    report.total > 0 &&
    report.missing.length === 0 &&
    report.unexpected.length === 0 &&
    report.covered === report.total
  ) {
    return;
  }
  const statuses = report.calls
    .map((call) => `${call.operationId}=${call.status}`)
    .join(", ");
  throw new Error(
    `Public API e2e coverage ${report.covered}/${report.total} (${report.percent}%). Missing: ${report.missing.join(", ") || "none"}. Unexpected: ${report.unexpected.join(", ") || "none"}. Calls: ${statuses || "none"}.`,
  );
}
