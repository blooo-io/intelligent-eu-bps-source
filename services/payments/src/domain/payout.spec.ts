/**
 * Payout gate and amount (REQ-015, UAT-015, A2) — INT-426.
 */

import { describe, expect, it } from "vitest";
import {
  decidePayout,
  type PayoutPaymentView,
  type PayoutStatementView,
} from "./payout.js";

const st = (statuses: [string, string][]): PayoutStatementView => ({
  participantId: "P",
  period: "2026-10",
  currency: "EUR",
  invoices: [
    { invoiceId: "iA", producerId: "P", consumerId: "A", total: "12.00", status: statuses[0][1] },
    { invoiceId: "iB", producerId: "P", consumerId: "B", total: "8.50", status: statuses[1][1] },
    { invoiceId: "iC", producerId: "C", consumerId: "P", total: "6.25", status: "Open" },
  ],
});
const pays: PayoutPaymentView[] = [
  { invoiceId: "iA", payeeId: "P", status: "succeeded", amount: "12.00", pspFee: "0.43" },
  { invoiceId: "iB", payeeId: "P", status: "succeeded", amount: "8.50", pspFee: "0.37" },
];

describe("decidePayout (REQ-015)", () => {
  it("UAT-015 / A2: all producer invoices paid → payout of the net received (consumer-side iC ignored)", () => {
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Paid"]]), payments: pays }))
      .toEqual({ eligible: true, amount: "19.70", invoiceIds: ["iA", "iB"] });
  });

  it("A2: one unpaid producer invoice blocks the period", () => {
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Open"]]), payments: pays.slice(0, 1) }))
      .toEqual({ eligible: false, reason: "producer_invoices_unpaid", unpaidInvoiceIds: ["iB"] });
  });

  it("an invoice marked Paid manually (offline) contributes 0", () => {
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Paid"]]), payments: pays.slice(0, 1) }))
      .toMatchObject({ eligible: true, amount: "11.57" });
  });

  it("a Void producer invoice does not block", () => {
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Void"]]), payments: pays.slice(0, 1) }))
      .toMatchObject({ eligible: true, amount: "11.57", invoiceIds: ["iA"] });
  });

  it("no statement / pure consumer", () => {
    expect(decidePayout({ participantId: "P", statement: null, payments: [] }))
      .toEqual({ eligible: false, reason: "statement_not_found" });
    expect(decidePayout({ participantId: "C2", statement: { ...st([["iA", "Paid"], ["iB", "Paid"]]), participantId: "C2" }, payments: [] }))
      .toEqual({ eligible: false, reason: "nothing_to_pay_out" });
  });

  it("ignores non-succeeded payments, other payees, foreign invoices; missing pspFee counts as 0", () => {
    const payments: PayoutPaymentView[] = [
      { invoiceId: "iA", payeeId: "P", status: "succeeded", amount: "12.00" },
      { invoiceId: "iA", payeeId: "P", status: "failed", amount: "12.00", pspFee: "0.43" },
      { invoiceId: "iB", payeeId: "X", status: "succeeded", amount: "8.50", pspFee: "0.37" },
      { invoiceId: "iB", status: "succeeded", amount: "8.50" },
      { invoiceId: "iC", payeeId: "P", status: "succeeded", amount: "6.25" },
    ];
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Paid"]]), payments }))
      .toEqual({ eligible: true, amount: "12.00", invoiceIds: ["iA", "iB"] });
  });

  it("parses whole and one-decimal amounts", () => {
    const payments: PayoutPaymentView[] = [
      { invoiceId: "iA", payeeId: "P", status: "succeeded", amount: "12", pspFee: "0.5" },
    ];
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Void"]]), payments }))
      .toMatchObject({ eligible: true, amount: "11.50" });
  });

  it("net zero after fees → nothing_to_pay_out", () => {
    const payments: PayoutPaymentView[] = [
      { invoiceId: "iA", payeeId: "P", status: "succeeded", amount: "0.25", pspFee: "0.25" },
    ];
    expect(decidePayout({ participantId: "P", statement: st([["iA", "Paid"], ["iB", "Void"]]), payments }))
      .toEqual({ eligible: false, reason: "nothing_to_pay_out" });
  });
});
