import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import {
  computeStatement,
  type StatementInvoiceView,
  type StatementTotals,
} from "../domain/statement.js";
import { StatementStore, type StatementRecord } from "../domain/statement-store.js";
import { InvoiceStore, type InvoiceWrite } from "../domain/store.js";
import type { InvoiceRecord } from "../domain/types.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "../ports/participants-resolver.port.js";

const PRODUCER = "AC-06";

type StatementScope = { participantId: string; communityId: string; period: string };

/**
 * REQ-059 / REQ-054 — informative monthly statement per participant over the
 * legal invoices of a period. Never payable; payment stays per invoice.
 */
@Injectable()
export class StatementsService {
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();

  constructor(
    @Inject(InvoiceStore) private readonly invoices: InvoiceStore,
    @Inject(StatementStore) private readonly statements: StatementStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PARTICIPANTS_RESOLVER)
    private readonly idpResolver: ParticipantsResolverPort,
  ) {}

  /** INT-356 — same Postgres transaction as the invoices when DATABASE_URL is set. */
  useTransaction(tx: RecordingTransaction<InvoiceWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

  /**
   * REQ-059 / UAT-076 — after a billing run, (re)issue the statement of every
   * participant on the run's invoices. A later run in the same period (final or
   * correction) revises the existing statement; an unchanged statement is left
   * as is, so redelivery of the same run is idempotent.
   */
  async issueStatementsForRun(runId: string): Promise<StatementRecord[]> {
    return this.tx.run(() => this.performIssueStatementsForRun(runId));
  }

  private async performIssueStatementsForRun(runId: string): Promise<StatementRecord[]> {
    const all = this.invoices.list();
    const scopes = new Map<string, StatementScope>();
    for (const invoice of all) {
      // An invoice without a period (operator bridge) cannot be placed on a statement.
      if (invoice.runId !== runId || !invoice.period) continue;
      for (const participantId of [invoice.producerId, invoice.consumerId]) {
        const scope = { participantId, communityId: invoice.communityId, period: invoice.period };
        scopes.set(JSON.stringify(scope), scope);
      }
    }

    const issued: StatementRecord[] = [];
    for (const scope of scopes.values()) {
      issued.push(await this.issue(scope, all));
    }
    return issued;
  }

  private async issue(scope: StatementScope, all: InvoiceRecord[]): Promise<StatementRecord> {
    const own = invoicesOf(scope, all);
    const totals = computeStatement(scope.participantId, own);
    const existing = this.statements.find(scope.participantId, scope.communityId, scope.period);
    if (existing && sameContent(existing, totals)) return existing;

    const now = new Date().toISOString();
    const row: StatementRecord = {
      ...totals,
      statementId: existing?.statementId ?? randomUUID(),
      participantId: scope.participantId,
      communityId: scope.communityId,
      period: scope.period,
      periodFrom: earliest(own.map((i) => i.periodFrom)),
      periodUntil: latest(own.map((i) => i.periodUntil)),
      currency: own[0]!.currency,
      revision: (existing?.revision ?? 0) + 1,
      issuedAt: existing?.issuedAt ?? now,
      updatedAt: now,
    };
    this.statements.upsert(row);
    await this.appendIssued(row);
    return row;
  }

  /**
   * REQ-059 — after an invoice status change, re-derive the status of every
   * statement that lists the invoice. StatementStatusChanged is emitted only
   * when the derived status changes; a Void invoice also leaves the totals, so
   * the statement is then revised (StatementIssued with revision + 1).
   */
  async recomputeForInvoice(invoiceId: string): Promise<void> {
    return this.tx.run(() => this.performRecomputeForInvoice(invoiceId));
  }

  private async performRecomputeForInvoice(invoiceId: string): Promise<void> {
    const statements = this.statements.listByInvoice(invoiceId);
    if (statements.length === 0) return;
    const all = this.invoices.list();
    for (const existing of statements) {
      const totals = computeStatement(existing.participantId, invoicesOf(existing, all));
      const revised = !sameContent(existing, totals);
      if (!revised && totals.status === existing.status) continue;

      const row: StatementRecord = {
        ...existing,
        ...totals,
        revision: existing.revision + (revised ? 1 : 0),
        updatedAt: new Date().toISOString(),
      };
      this.statements.upsert(row);
      if (revised) await this.appendIssued(row);
      if (row.status !== existing.status) {
        // NFR-015 — identifiers and status only.
        await this.outbox.append({
          aggregateType: "Statement",
          aggregateId: row.statementId,
          type: "StatementStatusChanged",
          producer: PRODUCER,
          communityId: row.communityId,
          billingMode: "virtual",
          data: {
            statementId: row.statementId,
            participantId: row.participantId,
            period: row.period,
            status: row.status,
          },
        });
      }
    }
  }

  private async appendIssued(row: StatementRecord): Promise<void> {
    // NFR-015 — identifiers and amounts only.
    await this.outbox.append({
      aggregateType: "Statement",
      aggregateId: row.statementId,
      type: "StatementIssued",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        statementId: row.statementId,
        participantId: row.participantId,
        period: row.period,
        periodFrom: row.periodFrom,
        periodUntil: row.periodUntil,
        totalBought: row.totalBought,
        totalSold: row.totalSold,
        netBalance: row.netBalance,
        currency: row.currency,
        invoiceIds: row.invoiceIds,
        status: row.status,
        revision: row.revision,
      },
    });
  }

  /** REQ-010 — statements of the caller (IdP sub and the AC-03 participant it maps to). */
  async listForParticipant(sub: string): Promise<StatementRecord[]> {
    const ids = new Set<string>([sub]);
    const resolved = await this.idpResolver.resolveByIdpSub(sub);
    if (resolved?.participantId) ids.add(resolved.participantId);
    return this.statements.listByParticipant([...ids]);
  }

  async listInternal(
    participantId: string,
    period?: string,
  ): Promise<Array<StatementRecord & { invoices: StatementInvoiceView[] }>> {
    return this.statements
      .listByParticipant([participantId])
      .filter((s) => period === undefined || s.period === period)
      .map((s) => ({
        ...s,
        invoices: s.invoiceIds.flatMap((invoiceId) => {
          const invoice = this.invoices.get(invoiceId);
          if (!invoice) return [];
          const { producerId, consumerId, total, status } = invoice;
          return [{ invoiceId, producerId, consumerId, total, status }];
        }),
      }));
  }
}

function invoicesOf(scope: StatementScope, all: InvoiceRecord[]): InvoiceRecord[] {
  return all.filter(
    (i) =>
      i.communityId === scope.communityId &&
      i.period === scope.period &&
      (i.producerId === scope.participantId || i.consumerId === scope.participantId),
  );
}

function sameContent(existing: StatementRecord, totals: StatementTotals): boolean {
  return (
    existing.totalBought === totals.totalBought &&
    existing.totalSold === totals.totalSold &&
    existing.netBalance === totals.netBalance &&
    [...existing.invoiceIds].sort().join() === [...totals.invoiceIds].sort().join()
  );
}

function earliest(values: string[]): string {
  return values.filter(Boolean).sort()[0] ?? "";
}

function latest(values: string[]): string {
  return values.filter(Boolean).sort().at(-1) ?? "";
}
