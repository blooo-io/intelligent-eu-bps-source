import { describe, expect, it } from "vitest";
import { InvoiceStore } from "./store.js";
import {
  UAT_HOSTED_INVOICE_URL,
  UAT_INLINE_PDF,
  UAT_INVOICE_ID,
  UAT_MEMBER_IDP_SUB,
  seedUatInvoices,
} from "./uat-seed.js";

describe("UAT invoice seed (INT-218)", () => {
  it("seeds a Paid invoice for the hugo.petit IdP subject", () => {
    const rows = seedUatInvoices();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceId: UAT_INVOICE_ID,
      consumerId: UAT_MEMBER_IDP_SUB,
      status: "Paid",
      hostedInvoiceUrl: UAT_HOSTED_INVOICE_URL,
    });
    expect(UAT_HOSTED_INVOICE_URL.startsWith("seed:")).toBe(true);
    expect(UAT_INLINE_PDF.toString("utf8")).toContain("%PDF");
  });

  it("InvoiceStore constructor and reset keep the UAT fixture", () => {
    const store = new InvoiceStore();
    expect(store.get(UAT_INVOICE_ID)?.consumerId).toBe(UAT_MEMBER_IDP_SUB);
    store.reset();
    expect(store.get(UAT_INVOICE_ID)?.status).toBe("Paid");
  });
});
