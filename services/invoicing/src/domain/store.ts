import type { InvoiceRecord } from "./types.js";
import { seedUatInvoices } from "./uat-seed.js";

/** Rebuildable Stripe read cache + local invoice ids (TP-7). */
export class InvoiceStore {
  private byId = new Map<string, InvoiceRecord>();
  private bySettlement = new Map<string, string>();

  constructor() {
    // INT-218 — load UAT fixture invoices once (survives nothing; re-seed on construct).
    for (const row of seedUatInvoices()) {
      this.put(row);
    }
  }

  reset(): void {
    this.byId.clear();
    this.bySettlement.clear();
    for (const row of seedUatInvoices()) {
      this.put(row);
    }
  }

  get(invoiceId: string): InvoiceRecord | undefined {
    const row = this.byId.get(invoiceId);
    return row ? structuredClone(row) : undefined;
  }

  findBySettlement(settlementId: string): InvoiceRecord | undefined {
    const id = this.bySettlement.get(settlementId);
    return id ? this.get(id) : undefined;
  }

  put(row: InvoiceRecord): void {
    this.byId.set(row.invoiceId, structuredClone(row));
    this.bySettlement.set(row.settlementId, row.invoiceId);
  }

  list(): InvoiceRecord[] {
    return [...this.byId.values()].map((r) => structuredClone(r));
  }
}
