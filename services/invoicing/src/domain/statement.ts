import type { InvoiceRecord, InvoiceStatus } from "./types.js";

/** REQ-059 — ontology `billingStatus`, without Disputed. */
export type StatementStatus = "Open" | "PartiallyPaid" | "Paid" | "Overdue" | "Void";

export type StatementInvoiceView = Pick<
  InvoiceRecord,
  "invoiceId" | "producerId" | "consumerId" | "total" | "status"
>;

export type StatementTotals = {
  totalBought: string;
  totalSold: string;
  /** Signed, positive = the participant receives. */
  netBalance: string;
  direction: "to_pay" | "to_receive" | "balanced";
  invoiceIds: string[];
  status: StatementStatus;
};

/**
 * REQ-059 / UAT-076 — informative monthly statement of one participant over the
 * legal invoices where it is producer (sold) or consumer (bought). Never payable.
 * Void invoices stay in `invoiceIds` but do not count in the totals.
 */
export function computeStatement(
  participantId: string,
  invoices: StatementInvoiceView[],
): StatementTotals {
  const own = invoices.filter(
    (i) => i.producerId === participantId || i.consumerId === participantId,
  );
  let sold = 0n;
  let bought = 0n;
  for (const invoice of own) {
    if (invoice.status === "Void") continue;
    const cents = toCents(invoice.total);
    if (invoice.producerId === participantId) sold += cents;
    if (invoice.consumerId === participantId) bought += cents;
  }
  const net = sold - bought;
  return {
    totalBought: formatCents(bought),
    totalSold: formatCents(sold),
    netBalance: formatCents(net),
    direction: net > 0n ? "to_receive" : net < 0n ? "to_pay" : "balanced",
    invoiceIds: own.map((i) => i.invoiceId),
    status: deriveStatementStatus(own.map((i) => i.status)),
  };
}

/** REQ-059 — statement status from its invoices; Draft and Disputed count as unpaid. */
export function deriveStatementStatus(statuses: InvoiceStatus[]): StatementStatus {
  const live = statuses.filter((s) => s !== "Void");
  if (live.length === 0) return statuses.length > 0 ? "Void" : "Open";
  if (live.includes("Overdue")) return "Overdue";
  if (live.every((s) => s === "Paid")) return "Paid";
  if (live.some((s) => s === "Paid" || s === "PartiallyPaid")) return "PartiallyPaid";
  return "Open";
}

/** Exact cents from a decimal string; sub-cent precision is refused, never rounded. */
function toCents(amount: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error(`invalid amount: ${amount}`);
  const [, sign, units, frac = ""] = match;
  const cents = BigInt(units) * 100n + BigInt(frac.padEnd(2, "0"));
  return sign === "-" ? -cents : cents;
}

function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const body = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}
