import { describe, expect, it } from "vitest";
import { InvoiceStore } from "./store.js";
import { UAT_INVOICE_ID, seedUatInvoices } from "./uat-seed.js";

describe("InvoiceStore (INT-356)", () => {
  it("records puts while recording and returns them on takeRecording", () => {
    const store = new InvoiceStore();
    const base = store.get(UAT_INVOICE_ID)!;
    store.beginRecording();
    store.put({ ...base, status: "Open" });
    const writes = store.takeRecording();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.row.status).toBe("Open");
    store.put({ ...base, status: "Paid" });
    expect(store.takeRecording()).toHaveLength(0);
  });

  it("stopRecording clears pending writes", () => {
    const store = new InvoiceStore();
    store.beginRecording();
    store.put(store.get(UAT_INVOICE_ID)!);
    store.stopRecording();
    expect(store.takeRecording()).toHaveLength(0);
  });

  it("snapshot and restore round-trip rows", () => {
    const store = new InvoiceStore();
    const snap = store.snapshot();
    store.reset();
    expect(store.list()).toHaveLength(1);
    store.restore(snap);
    expect(store.get(UAT_INVOICE_ID)?.consumerId).toBe(
      seedUatInvoices()[0]!.consumerId,
    );
  });

  it("findBySettlement returns undefined for unknown settlement", () => {
    const store = new InvoiceStore();
    expect(store.findBySettlement("missing-settlement")).toBeUndefined();
  });

  it("listByParticipant filters consumer and producer", () => {
    const store = new InvoiceStore();
    const row = store.get(UAT_INVOICE_ID)!;
    expect(
      store.listByParticipant(row.consumerId).some(
        (r) => r.invoiceId === row.invoiceId,
      ),
    ).toBe(true);
    expect(
      store.listByParticipant(row.producerId).some(
        (r) => r.invoiceId === row.invoiceId,
      ),
    ).toBe(true);
    expect(store.listByParticipant("00000000-0000-4000-8000-000000000099")).toHaveLength(
      0,
    );
  });
});