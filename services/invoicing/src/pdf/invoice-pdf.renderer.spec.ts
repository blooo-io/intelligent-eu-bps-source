import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { InvoiceRecord } from "../domain/types.js";
import {
  invoiceContent,
  renderInvoicePdf,
  toWinAnsi,
} from "./invoice-pdf.renderer.js";

/** Fixture from Task 2.10 — EUR, no tariff, one buyer line. */
function invoice(over: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    invoiceId: "a0000000-0000-4000-8000-000000000001",
    settlementId: "s0000000-0000-4000-8000-000000000001",
    runId: "r0000000-0000-4000-8000-000000000001",
    period: "2026-11",
    periodFrom: "2026-11-01T00:00:00.000Z",
    periodUntil: "2026-12-01T00:00:00.000Z",
    producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
    consumerId: "11111111-2222-4333-8444-555555555555",
    currency: "EUR",
    status: "Open",
    total: "2.00",
    tradeIds: ["t1"],
    lines: [
      {
        tradeId: "t1",
        deliveryStart: "2026-11-01T00:00:00Z",
        deliveryEnd: "2026-11-01T01:00:00Z",
        role: "buyer",
        kWh: "10.000",
        pricePerKWh: "0.20",
        amount: "2.00",
      },
    ],
    legalNumber: "SB-66666666-000001",
    energyAmount: "2.00",
    vatAmount: "0.00",
    dueDate: "2026-12-15",
    communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    statusAudit: [],
    reminders: [],
    issuedAt: "2026-12-01T12:00:00.000Z",
    issuer: {
      participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      name: "Paul Nguyen",
      address: "1 Fixture Lane",
    },
    addressee: {
      participantId: "11111111-2222-4333-8444-555555555555",
      name: "Hugo Petit",
      address: "2 Fixture Lane",
    },
    mandate: { termsVersion: "v1", acceptedAt: null },
    amounts: {
      energy: "2.00",
      gridFee: "0.00",
      levy: "0.00",
      tax: "0.00",
      vat: "0.00",
      total: "2.00",
    },
    vatRate: 0,
    exchangeRate: null,
    tariffId: null,
    document: null,
    ...over,
  };
}

describe("invoice PDF renderer (Task 2.10 / A6)", () => {
  it("REQ-039 REQ-054 shows the self-billing issuer, mandate and addressee", () => {
    const lines = invoiceContent(invoice());
    expect(lines).toContain("SELF-BILLING INVOICE");
    expect(lines).toContain("Invoice number: SB-66666666-000001");
    expect(lines).toContain("Issuer (supplier): Paul Nguyen, 1 Fixture Lane");
    expect(lines).toContain(
      "Issued by the INTELLIGENT billing service in the name and on behalf of the supplier under the self-billing mandate accepted in the Terms & Conditions version v1.",
    );
    expect(lines).toContain(
      "Addressee (customer): Hugo Petit, 2 Fixture Lane",
    );
  });

  it("REQ-007 lists each trade with delivery period, role, kWh, prices and amount", () => {
    const lines = invoiceContent(invoice());
    expect(lines).toContain(
      "2026-11-01 00:00-01:00 UTC | buyer | 10.000 kWh | 0.20 | - | 2.00 EUR",
    );
  });

  it("REQ-007 REQ-004 shows the amount split and the no-tariff mention", () => {
    const lines = invoiceContent(invoice());
    expect(lines).toContain("Energy: 2.00 EUR");
    expect(lines).toContain("Grid fee: 0.00 EUR");
    expect(lines).toContain("Levies: 0.00 EUR");
    expect(lines).toContain("Taxes (excl. VAT): 0.00 EUR");
    expect(lines).toContain("VAT (0.00 %): 0.00 EUR");
    expect(lines).toContain("Total: 2.00 EUR");
    expect(lines).toContain(
      "Grid fees, levies and taxes are billed by your supplier or DSO: no DSO tariff is published for this community.",
    );
  });

  it("REQ-002 shows the ECB rate on a CHF invoice", () => {
    const lines = invoiceContent(
      invoice({
        currency: "CHF",
        exchangeRate: { rate: "0.9412", rateDate: "2026-11-30" },
        amounts: {
          energy: "1.88",
          gridFee: "0.00",
          levy: "0.00",
          tax: "0.00",
          vat: "0.00",
          total: "1.88",
        },
        total: "1.88",
        energyAmount: "1.88",
      }),
    );
    expect(lines).toContain(
      "Trade prices in EUR converted at the ECB reference rate 0.9412 of 2026-11-30.",
    );
  });

  it("A10.3 shows the adjusted price", () => {
    const lines = invoiceContent(
      invoice({
        lines: [
          {
            tradeId: "t1",
            deliveryStart: "2026-11-01T00:00:00Z",
            deliveryEnd: "2026-11-01T01:00:00Z",
            role: "buyer",
            kWh: "10.000",
            pricePerKWh: "0.20",
            adjustedPricePerKWh: "0.18",
            amount: "1.80",
          },
        ],
      }),
    );
    expect(lines.some((l) => l.includes("| 0.20 | 0.18 |"))).toBe(true);
  });

  it("REQ-039 renders a valid, deterministic PDF", async () => {
    const inv = invoice();
    const bytes = await renderInvoicePdf(inv);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("utf8")).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toBe("SB-66666666-000001");
    const again = await renderInvoicePdf(inv);
    const a = createHash("sha256").update(bytes).digest("hex");
    const b = createHash("sha256").update(again).digest("hex");
    expect(a).toBe(b);
  });

  it("paginates 200 lines", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      tradeId: `t${i}`,
      deliveryStart: "2026-11-01T00:00:00Z",
      deliveryEnd: "2026-11-01T01:00:00Z",
      role: "buyer" as const,
      kWh: "1.000",
      pricePerKWh: "0.20",
      amount: "0.20",
    }));
    const bytes = await renderInvoicePdf(invoice({ lines: many }));
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });

  it("toWinAnsi keeps the PDF renderable for non-Latin-1 names", async () => {
    expect(toWinAnsi("Łukasz Żółć")).toBe("Lukasz Zolc");
    await expect(
      renderInvoicePdf(
        invoice({
          issuer: {
            participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
            name: "Łukasz Żółć",
            address: "1 Fixture Lane",
          },
        }),
      ),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
