import { describe, expect, it } from "vitest";
import { computeStatement, deriveStatementStatus } from "./statement.js";
import type { InvoiceStatus } from "./types.js";

const inv = (id: string, p: string, c: string, total: string, status: InvoiceStatus = "Open") => ({
  invoiceId: id,
  producerId: p,
  consumerId: c,
  total,
  status,
});

describe("computeStatement (REQ-059)", () => {
  it("UAT-076 / REQ-059: one statement nets sales to A and B against a purchase from C", () => {
    const s = computeStatement("P", [inv("i1", "P", "A", "12.00"), inv("i2", "P", "B", "8.50"), inv("i3", "C", "P", "6.25")]);
    expect(s).toEqual({
      totalBought: "6.25",
      totalSold: "20.50",
      netBalance: "14.25",
      direction: "to_receive",
      invoiceIds: ["i1", "i2", "i3"],
      status: "Open",
    });
  });

  it("REQ-059: negative net is to_pay", () => {
    const s = computeStatement("P", [inv("i3", "C", "P", "6.25")]);
    expect(s.netBalance).toBe("-6.25");
    expect(s.direction).toBe("to_pay");
  });

  it("REQ-059: equal purchases and sales are balanced with a zero net", () => {
    const s = computeStatement("P", [inv("i1", "P", "A", "3.40"), inv("i2", "B", "P", "3.40")]);
    expect(s).toMatchObject({ totalBought: "3.40", totalSold: "3.40", netBalance: "0.00", direction: "balanced" });
  });

  it("REQ-059: sums 0.10 + 0.20 exactly", () => {
    expect(computeStatement("P", [inv("a", "P", "A", "0.10"), inv("b", "P", "B", "0.20")]).totalSold).toBe("0.30");
  });

  it("REQ-059: accepts totals with fewer than two decimals and large amounts", () => {
    const s = computeStatement("P", [inv("a", "P", "A", "9007199254740993"), inv("b", "P", "B", "0.5"), inv("c", "C", "P", "1")]);
    expect(s).toMatchObject({ totalSold: "9007199254740993.50", totalBought: "1.00", netBalance: "9007199254740992.50" });
  });

  it("REQ-059: Void invoices stay referenced but do not count in the totals", () => {
    const s = computeStatement("P", [inv("i1", "P", "A", "10.00", "Paid"), inv("i2", "C", "P", "4.00", "Void")]);
    expect(s).toEqual({
      totalBought: "0.00",
      totalSold: "10.00",
      netBalance: "10.00",
      direction: "to_receive",
      invoiceIds: ["i1", "i2"],
      status: "Paid",
    });
  });

  it("REQ-059: invoices of other participants are left out", () => {
    const s = computeStatement("P", [inv("i1", "P", "A", "2.00"), inv("x", "A", "B", "99.00")]);
    expect(s.invoiceIds).toEqual(["i1"]);
    expect(s.totalSold).toBe("2.00");
    expect(s.totalBought).toBe("0.00");
  });

  it("REQ-059: an empty statement is balanced and Open", () => {
    expect(computeStatement("P", [])).toEqual({
      totalBought: "0.00",
      totalSold: "0.00",
      netBalance: "0.00",
      direction: "balanced",
      invoiceIds: [],
      status: "Open",
    });
  });

  it("REQ-059: status is derived from the participant's invoices only", () => {
    const s = computeStatement("P", [inv("i1", "P", "A", "1.00", "Paid"), inv("x", "A", "B", "1.00", "Overdue")]);
    expect(s.status).toBe("Paid");
  });

  it("REQ-059: rejects a malformed or sub-cent total instead of rounding it", () => {
    expect(() => computeStatement("P", [inv("i1", "P", "A", "12.345")])).toThrow(/invalid amount/);
    expect(() => computeStatement("P", [inv("i1", "P", "A", "abc")])).toThrow(/invalid amount/);
    expect(() => computeStatement("P", [inv("i1", "P", "A", "")])).toThrow(/invalid amount/);
  });

  it("REQ-059: a negative invoice total (credit) reduces the side it belongs to", () => {
    const s = computeStatement("P", [inv("i1", "P", "A", "5.00"), inv("i2", "P", "A", "-0.05")]);
    expect(s.totalSold).toBe("4.95");
    expect(computeStatement("P", [inv("i3", "P", "A", "-0.05")]).netBalance).toBe("-0.05");
  });
});

describe("deriveStatementStatus (REQ-059)", () => {
  it("REQ-059 status: Paid+Open → PartiallyPaid; Paid+Void → Paid; Overdue wins; all Void → Void", () => {
    expect(deriveStatementStatus(["Paid", "Open"])).toBe("PartiallyPaid");
    expect(deriveStatementStatus(["Paid", "Void"])).toBe("Paid");
    expect(deriveStatementStatus(["Paid", "Overdue"])).toBe("Overdue");
    expect(deriveStatementStatus(["Void"])).toBe("Void");
    expect(deriveStatementStatus(["Disputed"])).toBe("Open");
  });

  it("REQ-059 status: Overdue wins over every other status, Void ignored", () => {
    expect(deriveStatementStatus(["Void", "Overdue", "Draft", "PartiallyPaid"])).toBe("Overdue");
  });

  it("REQ-059 status: any PartiallyPaid invoice makes the statement PartiallyPaid", () => {
    expect(deriveStatementStatus(["PartiallyPaid"])).toBe("PartiallyPaid");
    expect(deriveStatementStatus(["Open", "PartiallyPaid", "Void"])).toBe("PartiallyPaid");
  });

  it("REQ-059 status: Draft, Open and Disputed count as unpaid", () => {
    expect(deriveStatementStatus(["Draft", "Open", "Disputed"])).toBe("Open");
    expect(deriveStatementStatus(["Disputed", "Paid"])).toBe("PartiallyPaid");
  });

  it("REQ-059 status: all Paid → Paid; no invoice → Open", () => {
    expect(deriveStatementStatus(["Paid", "Paid"])).toBe("Paid");
    expect(deriveStatementStatus([])).toBe("Open");
  });
});
