/**
 * Payout gate and amount for one (participant, period) — REQ-015, UAT-015, A2.
 * Pure: the caller supplies the AC-06 statement and the AC-07 payments.
 */

export type PayoutStatementView = {
  participantId: string;
  period: string;
  currency: string;
  invoices: Array<{ invoiceId: string; producerId: string; consumerId: string; total: string; status: string }>;
};

export type PayoutPaymentView = {
  invoiceId: string;
  payeeId?: string;
  status: string;
  amount: string;
  pspFee?: string;
};

export type PayoutDecision =
  | { eligible: true; amount: string; invoiceIds: string[] }
  | {
      eligible: false;
      reason: "statement_not_found" | "producer_invoices_unpaid" | "nothing_to_pay_out";
      unpaidInvoiceIds?: string[];
    };

function toCents(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2));
}

function fromCents(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function decidePayout(input: {
  participantId: string;
  statement: PayoutStatementView | null;
  payments: PayoutPaymentView[];
}): PayoutDecision {
  const { participantId, statement, payments } = input;
  if (!statement) return { eligible: false, reason: "statement_not_found" };

  // A2: every non-Void invoice where the participant is the producer must be Paid.
  const producerInvoices = statement.invoices.filter(
    (i) => i.producerId === participantId && i.status !== "Void",
  );
  const unpaidInvoiceIds = producerInvoices.filter((i) => i.status !== "Paid").map((i) => i.invoiceId);
  if (unpaidInvoiceIds.length > 0) {
    return { eligible: false, reason: "producer_invoices_unpaid", unpaidInvoiceIds };
  }

  // Offline (manually Paid) invoices have no succeeded payment, so they add 0.
  const invoiceIds = producerInvoices.map((i) => i.invoiceId);
  const covered = new Set(invoiceIds);
  let cents = 0n;
  for (const p of payments) {
    if (p.status !== "succeeded" || p.payeeId !== participantId || !covered.has(p.invoiceId)) continue;
    cents += toCents(p.amount) - toCents(p.pspFee ?? "0.00");
  }
  if (cents <= 0n) return { eligible: false, reason: "nothing_to_pay_out" };
  return { eligible: true, amount: fromCents(cents), invoiceIds };
}
