import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ReportingStore } from "../domain/store.js";
import type {
  InvoiceProjection,
  PaymentProjection,
  PeriodicSummary,
} from "../domain/types.js";
import { suggestedCorrectiveAction } from "./corrective-action.js";
import { sumMoney } from "./money.js";

/**
 * AC-09 reporting — read models from projected billing events (INT-112 / INT-82).
 * REQ-018 overview, REQ-031 history, REQ-032 summary, REQ-046/047 KPI export.
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

  /** Project PaymentStatusChanged. */
  projectPayment(row: PaymentProjection): void {
    this.store.putPayment(row);
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
   * Member history — invoices + payments for one participant (REQ-031 / UAT-031).
   */
  getParticipantHistory(participantId: string): {
    participantId: string;
    invoices: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  } {
    if (!participantId) {
      throw new BadRequestException("participantId is required");
    }
    const invoices = this.store.listInvoices({ participantId });
    if (invoices.length === 0) {
      // Empty history is valid for a known id; still return the shell.
      return { participantId, invoices: [], payments: [] };
    }
    const invoiceIds = new Set(invoices.map((i) => i.invoiceId));
    const payments = this.store
      .listPayments({})
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
    const currency = invoices[0]?.currency ?? payments[0]?.currency ?? "EUR";
    return {
      communityId,
      period,
      currency,
      invoiceCount: invoices.length,
      paymentCount: payments.length,
      total: sumMoney(invoices.map((i) => i.total)),
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
