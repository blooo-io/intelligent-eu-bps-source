import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { InvoiceRecord, InvoiceTradeLine } from "../domain/types.js";

/** Nest DI token for the invoice PDF renderer (A6 / REQ-039). */
export const INVOICE_RENDERER = Symbol("INVOICE_RENDERER");

export type InvoiceRenderer = (invoice: InvoiceRecord) => Promise<Uint8Array>;

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;

/** Map single-byte WinAnsi gaps that NFD cannot strip (ł, ß, …). */
const WIN_ANSI_MAP: Record<string, string> = {
  ł: "l",
  Ł: "L",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  ø: "o",
  Ø: "O",
  ð: "d",
  Ð: "D",
  þ: "th",
  Þ: "Th",
};

/**
 * Helvetica is WinAnsi-encoded. Strip combining marks (NFD) and map a few
 * Latin-extended letters so non-Latin-1 names stay renderable.
 */
export function toWinAnsi(text: string): string {
  const mapped = [...text]
    .map((ch) => WIN_ANSI_MAP[ch] ?? ch)
    .join("");
  return mapped
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function amountsOf(invoice: InvoiceRecord) {
  return (
    invoice.amounts ?? {
      energy: invoice.energyAmount,
      gridFee: "0.00",
      levy: "0.00",
      tax: "0.00",
      vat: invoice.vatAmount,
      total: invoice.total,
    }
  );
}

/** Inclusive billing-period end: periodUntil is exclusive (Task 2.10). */
function inclusivePeriodEnd(periodUntil: string): string {
  if (!periodUntil) return "";
  const d = new Date(periodUntil);
  if (Number.isNaN(d.getTime())) return periodUntil.slice(0, 10);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDelivery(line: InvoiceTradeLine): string {
  if (!line.deliveryStart || !line.deliveryEnd) return "-";
  const start = new Date(line.deliveryStart);
  const end = new Date(line.deliveryEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
  const day = start.toISOString().slice(0, 10);
  const st = start.toISOString().slice(11, 16);
  const et = end.toISOString().slice(11, 16);
  return `${day} ${st}-${et} UTC`;
}

function formatTradeLine(line: InvoiceTradeLine, currency: string): string {
  const role = line.role ?? "buyer";
  const adjusted = line.adjustedPricePerKWh ?? "-";
  return `${formatDelivery(line)} | ${role} | ${line.kWh} kWh | ${line.pricePerKWh} | ${adjusted} | ${line.amount} ${currency}`;
}

function issueDate(invoice: InvoiceRecord): string {
  if (invoice.issuedAt) return invoice.issuedAt.slice(0, 10);
  return "";
}

function vatPercent(invoice: InvoiceRecord): string {
  const rate = invoice.vatRate ?? 0;
  return (rate * 100).toFixed(2);
}

/**
 * Pure ordered text lines for the self-billing PDF (REQ-039, REQ-007, REQ-004, REQ-002, REQ-054).
 */
export function invoiceContent(invoice: InvoiceRecord): string[] {
  const amounts = amountsOf(invoice);
  const currency = invoice.currency;
  const lines: string[] = [
    "SELF-BILLING INVOICE",
    `Invoice number: ${invoice.legalNumber ?? ""}`,
  ];

  const issued = issueDate(invoice);
  if (issued) lines.push(`Issue date: ${issued}`);

  if (invoice.periodFrom || invoice.periodUntil) {
    const from = invoice.periodFrom ? invoice.periodFrom.slice(0, 10) : "";
    const until = inclusivePeriodEnd(invoice.periodUntil);
    lines.push(`Billing period: ${from} – ${until}`);
  }

  lines.push(`Due date: ${invoice.dueDate}`);

  if (invoice.issuer) {
    lines.push(
      `Issuer (supplier): ${invoice.issuer.name}, ${invoice.issuer.address}`,
    );
  }

  if (invoice.mandate) {
    lines.push(
      `Issued by the INTELLIGENT billing service in the name and on behalf of the supplier under the self-billing mandate accepted in the Terms & Conditions version ${invoice.mandate.termsVersion}.`,
    );
  }

  if (invoice.addressee) {
    lines.push(
      `Addressee (customer): ${invoice.addressee.name}, ${invoice.addressee.address}`,
    );
  }

  lines.push("");
  for (const trade of invoice.lines) {
    lines.push(formatTradeLine(trade, currency));
  }
  lines.push("");

  lines.push(`Energy: ${amounts.energy} ${currency}`);
  lines.push(`Grid fee: ${amounts.gridFee} ${currency}`);
  lines.push(`Levies: ${amounts.levy} ${currency}`);
  lines.push(`Taxes (excl. VAT): ${amounts.tax} ${currency}`);
  lines.push(`VAT (${vatPercent(invoice)} %): ${amounts.vat} ${currency}`);
  lines.push(`Total: ${amounts.total} ${currency}`);

  if (!invoice.tariffId) {
    lines.push(
      "Grid fees, levies and taxes are billed by your supplier or DSO: no DSO tariff is published for this community.",
    );
  }

  if (
    invoice.currency !== "EUR" &&
    invoice.exchangeRate?.rate &&
    invoice.exchangeRate.rateDate
  ) {
    lines.push(
      `Trade prices in EUR converted at the ECB reference rate ${invoice.exchangeRate.rate} of ${invoice.exchangeRate.rateDate}.`,
    );
  }

  return lines;
}

/**
 * A6 / REQ-039 — deterministic A4 PDF (Helvetica, dates from issuedAt).
 */
export const renderInvoicePdf: InvoiceRenderer = async (invoice) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const issuedAt = invoice.issuedAt
    ? new Date(invoice.issuedAt)
    : new Date("1970-01-01T00:00:00.000Z");
  doc.setTitle(invoice.legalNumber ?? invoice.invoiceId);
  doc.setProducer("INTELLIGENT Billing Service");
  doc.setCreator("INTELLIGENT Billing Service");
  doc.setCreationDate(issuedAt);
  doc.setModificationDate(issuedAt);

  const content = invoiceContent(invoice).map(toWinAnsi);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  for (const line of content) {
    if (y < MARGIN_BOTTOM + LINE_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }
    if (line.length > 0) {
      page.drawText(line, {
        x: MARGIN_X,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
        maxWidth: PAGE_WIDTH - 2 * MARGIN_X,
      });
    }
    y -= LINE_HEIGHT;
  }

  return doc.save({ useObjectStreams: false });
};
