import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
import type { PayoutStatementView } from "../domain/payout.js";

/** REQ-015 / REQ-059 — AC-06 ListStatements(participantId, period?) with the invoice lines the payout gate needs. */
export interface StatementLookupPort {
  list(participantId: string, period?: string): Promise<PayoutStatementView[]>;
}

export const STATEMENT_LOOKUP = Symbol("STATEMENT_LOOKUP");

/** In-memory stub for unit tests and local runs without AC-06. */
export class InMemoryStatementLookup implements StatementLookupPort {
  private rows: PayoutStatementView[] = [];

  put(row: PayoutStatementView): void {
    this.rows = this.rows.filter(
      (s) => !(s.participantId === row.participantId && s.period === row.period),
    );
    this.rows.push(structuredClone(row));
  }

  reset(): void {
    this.rows = [];
  }

  async list(participantId: string, period?: string): Promise<PayoutStatementView[]> {
    return this.rows
      .filter((s) => s.participantId === participantId && (period === undefined || s.period === period))
      .map((s) => structuredClone(s));
  }
}

export class HttpStatementLookup implements StatementLookupPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async list(participantId: string, period?: string): Promise<PayoutStatementView[]> {
    const query = new URLSearchParams({ participantId });
    if (period !== undefined) query.set("period", period);
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/statements?${query.toString()}`;
    const res = await this.fetchImpl(url, {
      headers: { ...(await resolveServiceAuthHeaders("ac-07-payments", this.auth)) },
    });
    if (!res.ok) {
      throw new Error(`invoicing listStatements failed with ${res.status}`);
    }
    const rows = (await res.json()) as PayoutStatementView[];
    return rows.map(({ participantId: id, period: p, currency, invoices }) => ({
      participantId: id,
      period: p,
      currency,
      invoices: invoices.map(({ invoiceId, producerId, consumerId, total, status }) => ({
        invoiceId,
        producerId,
        consumerId,
        total,
        status,
      })),
    }));
  }
}
