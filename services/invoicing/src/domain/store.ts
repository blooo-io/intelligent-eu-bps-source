import type { InvoiceRecord } from "./types.js";

/** Rebuildable Stripe read cache + local invoice ids (TP-7). */
export class InvoiceStore {
  private byId = new Map<string, InvoiceRecord>();
  private bySettlement = new Map<string, string>();

  reset(): void {
    this.byId.clear();
    this.bySettlement.clear();
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
