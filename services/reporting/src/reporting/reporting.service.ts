import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { suggestedCorrectiveAction } from "@intelligent/module-template";
import { ReportingStore } from "../domain/store.js";
import type {
  InvoiceProjection,
  PaymentProjection,
  PayoutProjection,
  PeriodicSummary,
  StatementProjection,
} from "../domain/types.js";
import { sumMoney } from "./money.js";

/**
 * AC-09 reporting — read models from projected billing events (INT-112 / INT-82).
 * REQ-018 overview, REQ-031 history, REQ-032 summary, REQ-046/047 KPI export,
 * REQ-060 payout overview.
 */
@Injectable()
export class ReportingService {
  constructor(
    @Inject(ReportingStore) private readonly store: ReportingStore,
  ) {}

  resetStore(): void {
    this.store.reset();
  }

  /** Project InvoiceIssued / InvoiceStatusChanged. */
  projectInvoice(row: InvoiceProjection): void {
    this.store.putInvoice(row);
  }

  /**
   * Project PaymentStatusChanged.
   * Merge-on-put: undefined fields on the next event keep previous values
   * (a later pending event must not erase settledAt / fee — REQ-046 / UAT-057).
   */
  projectPayment(row: PaymentProjection): void {
    const previous = this.store.getPayment(row.paymentId);
    if (!previous) {
      this.store.putPayment(row);
      return;
    }
    this.store.putPayment({ ...previous, ...definedFieldsOf(row) });
  }

  /** Project StatementIssued / StatementStatusChanged. */
  projectStatement(row: StatementProjection): void {
    this.store.putStatement(row);
  }

  getStatement(statementId: string): StatementProjection | undefined {
    return this.store.getStatement(statementId);
  }

  /** Project PayoutStatusChanged. */
  projectPayout(row: PayoutProjection): void {
    this.store.putPayout(row);
  }

  /**
   * Manager payment overview for a community (REQ-018 / UAT-018).
   * Returns Payment[] matching public.v1 schema.
   */
  getPaymentsOverview(communityId: string): Array<{
    paymentId: string;
    invoiceId: string;
    amount: string;
    currency: string;
    status: string;
    method?: string;
    failureCategory?: string;
  }> {
    if (!communityId) throw new BadRequestException("communityId is required");
    return this.store.listPayments({ communityId }).map((p) => ({
      paymentId: p.paymentId,
      invoiceId: p.invoiceId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      method: p.method,
      failureCategory: p.failureCategory,
    }));
  }

  /**
   * Manager payout overview — one row per statement with totalSold > 0 (REQ-060 / UAT-077).
   * Joins the latest payout for (participant, period). completed iff payout status is paid.
   */
  getPayoutsOverview(
    communityId: string,
    period?: string,
  ): Array<{
    participantId: string;
    period: string;
    expectedAmount: string;
    currency: string;
    status: "completed" | "open";
    payoutId?: string;
    paidOutAmount?: string;
    payoutStatus?: string;
  }> {
    if (!communityId) throw new BadRequestException("communityId is required");
    const statements = this.store
      .listStatements({ communityId, period })
      .filter((s) => Number(s.totalSold) > 0)
      .sort((a, b) =>
        a.participantId === b.participantId
          ? a.period.localeCompare(b.period)
          : a.participantId.localeCompare(b.participantId),
      );
    const payouts = this.store.listPayouts({ communityId, period });
    // Latest payout per (participant, period) — Map iteration is insertion order.
    const latestByKey = new Map<string, PayoutProjection>();
    for (const p of payouts) {
      latestByKey.set(`${p.participantId}:${p.period}`, p);
    }
    return statements.map((s) => {
      const payout = latestByKey.get(`${s.participantId}:${s.period}`);
      if (!payout) {
        return {
          participantId: s.participantId,
          period: s.period,
          expectedAmount: s.totalSold,
          currency: s.currency,
          status: "open" as const,
        };
      }
      const completed = payout.status === "paid";
      return {
        participantId: s.participantId,
        period: s.period,
        expectedAmount: s.totalSold,
        currency: s.currency,
        status: (completed ? "completed" : "open") as "completed" | "open",
        payoutId: payout.payoutId,
        paidOutAmount: payout.amount,
        payoutStatus: payout.status,
      };
    });
  }

  /**
   * Member history — invoices + payments for one participant (REQ-031 / UAT-031).
   * Scope binds the read to the caller's community and, for a member, their sub
   * (REQ-049 / UAT-060). Another community is hidden as an unknown participant.
   */
  getParticipantHistory(
    participantId: string,
    scope?: { communityId: string; selfParticipantId?: string },
  ): {
    participantId: string;
    invoices: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  } {
    if (!participantId) {
      throw new BadRequestException("participantId is required");
    }
    if (scope && !scope.communityId) {
      throw new ForbiddenException("Missing community scope");
    }
    if (
      scope?.selfParticipantId &&
      scope.selfParticipantId !== participantId
    ) {
      throw new NotFoundException(`Unknown participant ${participantId}`);
    }
    const invoices = this.store.listInvoices({
      participantId,
      communityId: scope?.communityId,
    });
    if (scope && invoices.length === 0) {
      const elsewhere = this.store.listInvoices({ participantId });
      if (elsewhere.length > 0) {
        throw new NotFoundException(`Unknown participant ${participantId}`);
      }
      // Empty history is valid when the participant has no invoices here.
      return { participantId, invoices: [], payments: [] };
    }
    if (invoices.length === 0) {
      return { participantId, invoices: [], payments: [] };
    }
    const invoiceIds = new Set(invoices.map((i) => i.invoiceId));
    const payments = this.store
      .listPayments(scope ? { communityId: scope.communityId } : {})
      .filter((p) => invoiceIds.has(p.invoiceId));

    return {
      participantId,
      invoices: invoices.map((i) => this.toPublicInvoice(i)),
      payments: payments.map((p) => ({
        paymentId: p.paymentId,
        invoiceId: p.invoiceId,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        failureCategory: p.failureCategory,
      })),
    };
  }

  /**
   * Periodic summary (REQ-032 / UAT-032). Uses built report when present,
   * otherwise computes live from projections.
   */
  getPeriodicSummary(communityId: string, period: string): PeriodicSummary {
    if (!communityId || !period) {
      throw new BadRequestException("communityId and period are required");
    }
    const built = this.store.getReport(communityId, period);
    if (built) return built.summary;
    return this.computeSummary(communityId, period);
  }

  /** BuildReport — AC-14 after period close (REQ-032). */
  async buildReport(input: {
    communityId: string;
    period: string;
  }): Promise<{ accepted: true }> {
    if (!input.communityId || !input.period) {
      throw new BadRequestException("communityId and period are required");
    }
    const summary = this.computeSummary(input.communityId, input.period);
    this.store.putReport({
      communityId: input.communityId,
      period: input.period,
      summary,
      builtAt: new Date().toISOString(),
    });
    return { accepted: true };
  }

  /** ExportKpi — AC-14 after period close (REQ-047 / UAT-058). */
  async exportKpi(input: {
    communityId: string;
    period: string;
  }): Promise<{ accepted: true }> {
    if (!input.communityId || !input.period) {
      throw new BadRequestException("communityId and period are required");
    }
    const csv = this.buildKpiCsv(input.communityId, input.period);
    this.store.putKpiExport({
      communityId: input.communityId,
      period: input.period,
      csv,
      builtAt: new Date().toISOString(),
    });
    return { accepted: true };
  }

  /**
   * Download KPI file for a period (REQ-047).
   * Builds on the fly if ExportKpi was not yet called.
   */
  getKpiExport(period: string, communityId: string): {
    filename: string;
    body: Buffer;
  } {
    if (!period || !communityId) {
      throw new BadRequestException("period and communityId are required");
    }
    let row = this.store.getKpiExport(communityId, period);
    if (!row) {
      const csv = this.buildKpiCsv(communityId, period);
      if (!csv.split("\n").slice(1).some((l) => l.trim())) {
        throw new NotFoundException(
          `No KPI data for community ${communityId} period ${period}`,
        );
      }
      row = {
        communityId,
        period,
        csv,
        builtAt: new Date().toISOString(),
      };
      this.store.putKpiExport(row);
    }
    return {
      filename: `kpi-${communityId}-${period}.csv`,
      body: Buffer.from(row.csv, "utf8"),
    };
  }

  private computeSummary(
    communityId: string,
    period: string,
  ): PeriodicSummary {
    const invoices = this.store.listInvoices({ communityId, period });
    const invoiceIds = new Set(invoices.map((i) => i.invoiceId));
    const payments = this.store.listPayments({ communityId, invoiceIds });
    const paidPayouts = this.store.listPayouts({
      communityId,
      period,
      status: "paid",
    });
    const currency =
      invoices[0]?.currency ??
      payments[0]?.currency ??
      paidPayouts[0]?.currency ??
      "EUR";
    return {
      communityId,
      period,
      currency,
      invoiceCount: invoices.length,
      paymentCount: payments.length,
      total: sumMoney(invoices.map((i) => i.total)),
      // REQ-032 — paidOut is the sum of paid Connect payouts in the period.
      paidOut: sumMoney(paidPayouts.map((p) => p.amount)),
    };
  }

  /**
   * KPI CSV — invoice rows (REQ-047) and payment rows (REQ-046 / UAT-057).
   * recordType distinguishes the two line shapes in one file.
   */
  private buildKpiCsv(communityId: string, period: string): string {
    const header =
      "recordType,communityId,period,participantId,invoiceId,paymentId,amount,energyKwh,currency,status,method,processingTimeMs,failureCategory,correctiveAction";
    const lines = [header];
    const invoices = this.store.listInvoices({ communityId, period });
    for (const inv of invoices) {
      // One row per consumer; producer side is the same invoice id (identifiers only).
      lines.push(
        [
          "invoice",
          inv.communityId,
          inv.period,
          inv.consumerId,
          inv.invoiceId,
          "",
          inv.total,
          inv.energyKwh ?? "0.00",
          inv.currency,
          inv.status,
          "",
          "",
          "",
          "",
        ].join(","),
      );
    }
    const invoiceIds = new Set(invoices.map((i) => i.invoiceId));
    for (const pay of this.store.listPayments({ communityId, invoiceIds })) {
      const corrective =
        pay.status === "failed"
          ? suggestedCorrectiveAction(pay.failureCategory)
          : "";
      lines.push(
        [
          "payment",
          pay.communityId,
          period,
          pay.participantId ?? "",
          pay.invoiceId,
          pay.paymentId,
          pay.amount,
          "",
          pay.currency,
          pay.status,
          pay.method ?? "",
          pay.processingTimeMs !== undefined
            ? String(pay.processingTimeMs)
            : "",
          pay.failureCategory ?? "",
          escapeCsv(corrective),
        ].join(","),
      );
    }
    return `${lines.join("\n")}\n`;
  }

  private toPublicInvoice(i: InvoiceProjection): Record<string, unknown> {
    return {
      invoiceId: i.invoiceId,
      producerId: i.producerId,
      consumerId: i.consumerId,
      period: i.period,
      currency: i.currency,
      status: i.status,
      tradeIds: i.tradeIds,
      amounts: {
        net: i.total,
        vat: "0.00",
        total: i.total,
      },
    };
  }
}

/** Escape commas/quotes in CSV fields (corrective action text). */
function escapeCsv(value: string): string {
  if (!value.includes(",") && !value.includes('"') && !value.includes("\n")) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

/** Shallow copy keeping only own keys whose value is not `undefined`. */
function definedFieldsOf<T extends object>(row: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(row) as Array<keyof T>) {
    const value = row[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
