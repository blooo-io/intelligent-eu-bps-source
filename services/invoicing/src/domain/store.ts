import { createHash } from "node:crypto";
import { formatLegalNumber, legalNumberSeq } from "./legal-number.js";
import type { StatementRecord } from "./statement-store.js";
import type { InvoiceRecord } from "./types.js";
import { seedUatInvoices, UAT_INLINE_PDF } from "./uat-seed.js";

export type InvoiceWrite =
  | { kind: "invoice"; row: InvoiceRecord }
  | { kind: "statement"; row: StatementRecord }
  | { kind: "document"; invoiceId: string; sha256: string; content: Buffer };

/**
 * Billing-owned invoice store (TP-7 / A6): legal numbers and documents live here.
 * INT-356 — recorded puts are committed with the outbox.
 */
export class InvoiceStore {
  private readonly byId = new Map<string, InvoiceRecord>();
  private readonly bySettlement = new Map<string, string>();
  /** REQ-039 — PDF bytes keyed by invoice id (not in row snapshot). */
  private readonly documents = new Map<
    string,
    { sha256: string; content: Buffer }
  >();
  private recording = false;
  private writes: Extract<InvoiceWrite, { kind: "invoice" | "document" }>[] = [];

  beginRecording(): void {
    this.recording = true;
    this.writes = [];
  }

  takeRecording(): Extract<InvoiceWrite, { kind: "invoice" | "document" }>[] {
    this.recording = false;
    return this.writes.splice(0);
  }

  stopRecording(): void {
    this.recording = false;
    this.writes = [];
  }

  /** Snapshot excludes document bytes (Task 2.8). */
  snapshot(): string {
    return JSON.stringify([...this.byId.values()]);
  }

  restore(snapshot: string): void {
    const rows = JSON.parse(snapshot) as InvoiceRecord[];
    const recording = this.recording;
    this.recording = false;
    this.byId.clear();
    this.bySettlement.clear();
    for (const row of rows) this.put(row);
    // Drop documents of invoices absent after restore / rollback.
    const keep = new Set(rows.map((r) => r.invoiceId));
    for (const id of [...this.documents.keys()]) {
      if (!keep.has(id)) this.documents.delete(id);
    }
    this.recording = recording;
  }

  constructor() {
    // INT-218 — load UAT fixture invoices once (survives nothing; re-seed on construct).
    this.seedFixtures();
  }

  reset(): void {
    this.byId.clear();
    this.bySettlement.clear();
    this.documents.clear();
    this.seedFixtures();
  }

  private seedFixtures(): void {
    for (const seeded of seedUatInvoices()) {
      // Seed document until a rendered PDF replaces it at issue (Task 2.10 / 2.12).
      const sha256 = createHash("sha256").update(UAT_INLINE_PDF).digest("hex");
      const row: InvoiceRecord = {
        ...seeded,
        document: { sha256, byteLength: UAT_INLINE_PDF.byteLength },
      };
      this.put(row);
      this.putDocument(row.invoiceId, sha256, UAT_INLINE_PDF);
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
    if (this.recording) this.writes.push({ kind: "invoice", row: structuredClone(row) });
  }

  /** REQ-039 — store the rendered PDF (insert-only at the journal layer). */
  putDocument(invoiceId: string, sha256: string, content: Buffer): void {
    const copy = Buffer.from(content);
    this.documents.set(invoiceId, { sha256, content: copy });
    if (this.recording) {
      this.writes.push({ kind: "document", invoiceId, sha256, content: copy });
    }
  }

  getDocument(invoiceId: string): Buffer | undefined {
    const doc = this.documents.get(invoiceId);
    return doc ? Buffer.from(doc.content) : undefined;
  }

  list(): InvoiceRecord[] {
    return [...this.byId.values()].map((r) => structuredClone(r));
  }

  /** REQ-013 — invoices involving a participant (retained under legal retention). */
  listByParticipant(participantId: string): InvoiceRecord[] {
    return this.list().filter(
      (row) =>
        row.consumerId === participantId || row.producerId === participantId,
    );
  }

  /**
   * REQ-042 / BR-10 — next gapless legal number for the producer (issuer).
   * Assigned inside the issue transaction so a rolled-back write leaves no gap.
   */
  nextLegalNumber(producerId: string): string {
    let max = 0;
    for (const row of this.byId.values()) {
      if (row.producerId !== producerId) continue;
      max = Math.max(max, legalNumberSeq(row.legalNumber));
    }
    return formatLegalNumber(producerId, max + 1);
  }
}
