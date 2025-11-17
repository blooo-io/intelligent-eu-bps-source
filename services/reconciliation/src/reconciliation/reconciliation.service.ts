import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboxService } from "@intelligent/module-template";
import { ReconciliationStore } from "../domain/store.js";
import type {
  Discrepancy,
  DiscrepancyScope,
  IntakeAnomalyProjection,
  InvoiceProjection,
  MarketProjection,
  PaymentProjection,
} from "../domain/types.js";

const PRODUCER = "AC-08";

/**
 * AC-08 reconciliation — invoice↔payment and market↔clearing (INT-108, REQ-041).
 * Read-only on other modules' data via local projections (02 §4.5 LB-07).
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(ReconciliationStore) private readonly store: ReconciliationStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  resetStore(): void {
    this.store.reset();
  }

  /** Project InvoiceIssued / InvoiceStatusChanged into the read cache. */
  projectInvoice(row: InvoiceProjection): void {
    this.store.putInvoice(row);
  }

  /** Project PaymentStatusChanged (amount carried in V1 local projection). */
  projectPayment(row: PaymentProjection): void {
    this.store.putPayment(row);
  }

  /** Project market clearing vs ingested trades (REQ-041 completeness). */
  projectMarket(row: MarketProjection): void {
    this.store.putMarket(row);
  }

  /** Project IntakeAnomalyDetected (AC-04) for market-scope flags. */
  projectIntakeAnomaly(row: IntakeAnomalyProjection): void {
    this.store.putAnomaly(row);
  }

  listDiscrepancies(communityId?: string): Array<{
    scope: DiscrepancyScope;
    expected: string;
    actual: string;
    status?: string;
  }> {
    return this.store.listDiscrepancies(communityId).map((d) => ({
      scope: d.scope,
      expected: d.expected,
      actual: d.actual,
      status: d.status,
    }));
  }

  /**
   * Reconcile(scope) — called by AC-14 (contracts/openapi/internal/reconciliation.v1.yaml).
   * REQ-041 / UAT-052.
   */
  async reconcile(input: {
    scope: DiscrepancyScope;
    communityId?: string;
  }): Promise<{ accepted: true }> {
    if (input.scope !== "invoice" && input.scope !== "market") {
      throw new BadRequestException("scope must be invoice or market");
    }
    if (input.scope === "invoice") {
      await this.reconcileInvoices(input.communityId);
    } else {
      await this.reconcileMarkets(input.communityId);
    }
    return { accepted: true };
  }

  private async reconcileInvoices(communityId?: string): Promise<void> {
    for (const invoice of this.store.listInvoices(communityId)) {
      const payments = this.store.listPaymentsForInvoice(invoice.invoiceId);
      if (payments.length === 0) {
        await this.recordDiscrepancy({
          key: `invoice:missing:${invoice.invoiceId}`,
          scope: "invoice",
          expected: `payment for invoice ${invoice.invoiceId} total=${invoice.total}`,
          actual: "missing",
          status: "open",
          communityId: invoice.communityId,
        });
        continue;
      }
      for (const payment of payments) {
        if (payment.status !== "succeeded") {
          await this.recordDiscrepancy({
            key: `invoice:status:${payment.paymentId}`,
            scope: "invoice",
            expected: `invoice ${invoice.invoiceId} payment status=succeeded`,
            actual: `payment ${payment.paymentId} status=${payment.status}`,
            status: "open",
            communityId: invoice.communityId,
          });
        } else if (payment.amount !== invoice.total) {
          await this.recordDiscrepancy({
            key: `invoice:amount:${payment.paymentId}`,
            scope: "invoice",
            expected: `invoice ${invoice.invoiceId} total=${invoice.total}`,
            actual: `payment ${payment.paymentId} amount=${payment.amount}`,
            status: "open",
            communityId: invoice.communityId,
          });
        }
      }
    }
  }

  private async reconcileMarkets(communityId?: string): Promise<void> {
    for (const market of this.store.listMarkets(communityId)) {
      if (
        market.actualNumTrades !== market.expectedNumTrades ||
        market.actualTradedQuantityKWh !== market.expectedTradedQuantityKWh
      ) {
        await this.recordDiscrepancy({
          key: `market:clearing:${market.marketId}`,
          scope: "market",
          expected: `market ${market.marketId} numTrades=${market.expectedNumTrades} tradedQuantityKWh=${market.expectedTradedQuantityKWh}`,
          actual: `market ${market.marketId} numTrades=${market.actualNumTrades} tradedQuantityKWh=${market.actualTradedQuantityKWh}`,
          status: "open",
          communityId: market.communityId,
        });
      }
    }

    for (const anomaly of this.store.listAnomalies(communityId)) {
      await this.recordDiscrepancy({
        key: `market:anomaly:${anomaly.marketId}:${anomaly.type}`,
        scope: "market",
        expected: `market ${anomaly.marketId} clearing match`,
        actual: `market ${anomaly.marketId} anomaly=${anomaly.type}${anomaly.details ? ` ${anomaly.details}` : ""}`,
        status: "open",
        communityId: anomaly.communityId,
      });
    }
  }

  private async recordDiscrepancy(
    input: Omit<Discrepancy, "id">,
  ): Promise<void> {
    if (this.store.getDiscrepancyByKey(input.key)) {
      return;
    }
    const row: Discrepancy = {
      id: randomUUID(),
      ...input,
    };
    this.store.putDiscrepancy(row);
    await this.outbox.append({
      aggregateType: "Discrepancy",
      aggregateId: row.id,
      type: "DiscrepancyDetected",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        scope: row.scope,
        expected: row.expected,
        actual: row.actual,
      },
    });
  }
}
