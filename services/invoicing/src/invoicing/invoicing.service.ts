import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import { InvoiceStore, type InvoiceWrite } from "../domain/store.js";
import type {
  InvoiceRecord,
  InvoiceStatus,
  PairSettlementInput,
} from "../domain/types.js";
import { UAT_INLINE_PDF } from "../domain/uat-seed.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "../ports/participants-resolver.port.js";
import {
  READINESS_PORT,
  type ReadinessPort,
} from "../ports/readiness.port.js";
import { StatementsService } from "./statements.service.js";

const PRODUCER = "AC-06";

/**
 * AC-06 — map pair settlement → billing-owned invoice (INT-428 / A6 / TD-2).
 * BR-09 readiness gate; BR-10 numbering owned by billing.
 */
@Injectable()
export class InvoicingService {
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();

  /** INT-356 — Postgres transaction around invoice writes when DATABASE_URL is set. */
  useTransaction(tx: RecordingTransaction<InvoiceWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

  constructor(
    @Inject(InvoiceStore) private readonly store: InvoiceStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(READINESS_PORT) private readonly readiness: ReadinessPort,
    @Inject(PARTICIPANTS_RESOLVER)
    private readonly idpResolver: ParticipantsResolverPort,
    @Inject(StatementsService) private readonly statements: StatementsService,
  ) {}

  resetStore(): void {
    this.store.reset();
  }

  getInvoice(invoiceId: string): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    communityId: string;
    currency: string;
    status: InvoiceStatus;
    legalNumber: string | null;
    dueDate: string;
    total: string;
    /** INT-196 / UAT-028 — originating trades for operator trace. */
    tradeIds: string[];
    pairSettlementId: string;
    amounts: { energy: string; vat: string; total: string };
  } {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    return this.toInternalInvoice(row);
  }

  /** INT-238 — lookup by pair settlement id (NATS smoke / operator poll). */
  getInvoiceBySettlement(settlementId: string): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    communityId: string;
    currency: string;
    status: InvoiceStatus;
    legalNumber: string | null;
    dueDate: string;
    total: string;
    tradeIds: string[];
    pairSettlementId: string;
    amounts: { energy: string; vat: string; total: string };
  } {
    const row = this.store.findBySettlement(settlementId);
    if (!row) {
      throw new NotFoundException(
        `No invoice for settlement ${settlementId}`,
      );
    }
    return this.toInternalInvoice(row);
  }

  private toInternalInvoice(row: InvoiceRecord): {
    invoiceId: string;
    producerId: string;
    consumerId: string;
    communityId: string;
    currency: string;
    status: InvoiceStatus;
    legalNumber: string | null;
    dueDate: string;
    total: string;
    tradeIds: string[];
    pairSettlementId: string;
    amounts: { energy: string; vat: string; total: string };
  } {
    return {
      invoiceId: row.invoiceId,
      producerId: row.producerId,
      consumerId: row.consumerId,
      communityId: row.communityId,
      currency: row.currency,
      status: row.status,
      legalNumber: row.legalNumber,
      dueDate: row.dueDate,
      total: row.total,
      tradeIds: row.tradeIds,
      pairSettlementId: row.settlementId,
      amounts: {
        energy: row.energyAmount,
        vat: row.vatAmount,
        total: row.total,
      },
    };
  }

  /**
   * INT-236 — JWT `sub` may be Keycloak idpUserId; also keep raw sub so UAT
   * seed invoices (consumerId = IdP sub) remain visible.
   */
  async resolveCallerIds(sub: string): Promise<string[]> {
    const ids = new Set<string>([sub]);
    const resolved = await this.idpResolver.resolveByIdpSub(sub);
    if (resolved?.participantId) {
      ids.add(resolved.participantId);
    }
    return [...ids];
  }

  private isCallerOnInvoice(
    row: InvoiceRecord,
    callerIds: ReadonlySet<string> | string[],
  ): boolean {
    const set =
      callerIds instanceof Set ? callerIds : new Set(callerIds);
    return set.has(row.producerId) || set.has(row.consumerId);
  }

  /** Public list for the authenticated caller (REQ-007 / INT-193 / INT-236). */
  async listInvoicesForParticipant(
    subOrParticipantId: string,
  ): Promise<Record<string, unknown>[]> {
    const callerIds = await this.resolveCallerIds(subOrParticipantId);
    const set = new Set(callerIds);
    return this.store
      .list()
      .filter((row) => this.isCallerOnInvoice(row, set))
      .map((row) => this.toPublicInvoice(row));
  }

  /** Public detail when the caller is producer or consumer (REQ-007). */
  async getPublicInvoiceForParticipant(
    invoiceId: string,
    subOrParticipantId: string,
  ): Promise<Record<string, unknown>> {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    const callerIds = await this.resolveCallerIds(subOrParticipantId);
    if (!this.isCallerOnInvoice(row, callerIds)) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    return this.toPublicInvoice(row);
  }

  /**
   * REQ-039 / A6 — billing-stored PDF for the caller (member on the invoice).
   * Stub bytes until the pdf-lib renderer (Task 2.10) stores a real document.
   */
  async getDocumentForCaller(
    invoiceId: string,
    subOrParticipantId: string,
  ): Promise<{ legalNumber: string; content: Buffer }> {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    const callerIds = await this.resolveCallerIds(subOrParticipantId);
    if (!this.isCallerOnInvoice(row, callerIds)) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    if (!row.legalNumber) {
      throw new NotFoundException(`No document for invoice ${invoiceId}`);
    }
    return { legalNumber: row.legalNumber, content: Buffer.from(UAT_INLINE_PDF) };
  }

  /**
   * TD-2 / A6 mapping: issue a billing-owned invoice from a pair settlement.
   * Idempotent on settlementId. Legal number sequential per producer (BR-10).
   */
  async createFromSettlement(
    settlement: PairSettlementInput,
  ): Promise<InvoiceRecord | null> {
    return this.tx.run(() => this.performCreateFromSettlement(settlement));
  }

  private async performCreateFromSettlement(
    settlement: PairSettlementInput,
  ): Promise<InvoiceRecord | null> {
    const existing = this.store.findBySettlement(settlement.settlementId);
    if (existing) {
      return existing;
    }

    // Skip zero-amount carry-forward rows (BR-05) — nothing to invoice.
    if (Number(settlement.energyAmount) === 0) {
      return null;
    }

    // BR-09 — hold until producer terms + KYC (CheckReadiness).
    const ready = await this.readiness.check(settlement.producerId);
    if (!ready.ready) {
      throw new BadRequestException(
        ready.reason ?? "producer not ready for self-billing",
      );
    }

    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + 14);
    const due = dueDate.toISOString().slice(0, 10);

    const total = (
      Number(settlement.energyAmount) + Number(settlement.vat)
    ).toFixed(2);

    // BR-10 / REQ-042 — assign inside the issue transaction (A6).
    const legalNumber = this.store.nextLegalNumber(settlement.producerId);

    const invoiceId = randomUUID();
    const record: InvoiceRecord = {
      invoiceId,
      settlementId: settlement.settlementId,
      runId: settlement.runId,
      period: settlement.period ?? "",
      periodFrom: settlement.periodFrom ?? "",
      periodUntil: settlement.periodUntil ?? "",
      producerId: settlement.producerId,
      consumerId: settlement.consumerId,
      currency: settlement.currency,
      status: "Open",
      total,
      tradeIds: settlement.tradeIds,
      lines: settlement.lines ?? [],
      legalNumber,
      energyAmount: settlement.energyAmount,
      vatAmount: settlement.vat,
      dueDate: due,
      communityId: settlement.communityId,
      statusAudit: [],
    };
    this.store.put(record);

    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: invoiceId,
      type: "InvoiceIssued",
      producer: PRODUCER,
      communityId: settlement.communityId,
      billingMode: "virtual",
      data: {
        invoiceId,
        issuerId: settlement.producerId,
        recipientId: settlement.consumerId,
        amounts: {
          energy: settlement.energyAmount,
          vat: settlement.vat,
          total,
        },
        currency: settlement.currency,
        tradeIds: settlement.tradeIds,
        settlementId: settlement.settlementId,
        dueDate: due,
        billingPeriodFrom: settlement.periodFrom,
        billingPeriodUntil: settlement.periodUntil,
        settlementType: settlement.settlementType ?? "periodic",
        totalEnergyKWh: settlement.kWh,
        vatRate: settlement.vatRate ?? 0,
        carriedForwardAmount: settlement.carriedForwardIn ?? "0.00",
        // NFR-004 — no conversion on an EUR invoice. A foreign currency
        // carries the ECB rate the settlement already applied (BR-06).
        exchangeRate:
          settlement.currency === "EUR" || !settlement.rateDate
            ? null
            : { rate: settlement.rate, rateDate: settlement.rateDate },
      },
    });

    return record;
  }

  async markOverdue(asOf: string): Promise<{ accepted: true; marked: number }> {
    return this.tx.run(() => this.performMarkOverdue(asOf));
  }

  private async performMarkOverdue(asOf: string): Promise<{ accepted: true; marked: number }> {
    if (!asOf) {
      throw new BadRequestException("asOf is required");
    }
    let marked = 0;
    for (const row of this.store.list()) {
      if (row.status === "Open" && row.dueDate < asOf) {
        await this.applyStatus(row, {
          status: "Overdue",
          reason: "past_due",
          actorId: "00000000-0000-4000-8000-000000000001",
          source: "mark_overdue",
        });
        marked += 1;
      }
    }
    return { accepted: true, marked };
  }

  /**
   * Manager manual status change (REQ-044 / UAT-055).
   * Reason is mandatory; actor + reason go to statusAudit and AuditableActionPerformed.
   */
  async setInvoiceStatus(
    invoiceId: string,
    input: {
      status: InvoiceStatus;
      reason: string;
      actorId: string;
      /** REQ-049 — when set, another community's invoice is hidden. */
      communityId?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.tx.run(() => this.performSetInvoiceStatus(invoiceId, input));
  }

  private async performSetInvoiceStatus(
    invoiceId: string,
    input: {
      status: InvoiceStatus;
      reason: string;
      actorId: string;
      communityId?: string;
    },
  ): Promise<Record<string, unknown>> {
    if (!input.reason?.trim()) {
      throw new BadRequestException("reason is required");
    }
    if (!ALLOWED_STATUSES.has(input.status)) {
      throw new BadRequestException(`unsupported status ${input.status}`);
    }
    const row = this.store.get(invoiceId);
    if (!row) throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    // REQ-049 / UAT-060 — manager acts only inside their community.
    if (
      input.communityId !== undefined &&
      row.communityId !== input.communityId
    ) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }

    const next = await this.applyStatus(row, {
      status: input.status,
      reason: input.reason.trim(),
      actorId: input.actorId,
      source: "manual",
    });
    return this.toPublicInvoice(next);
  }

  /**
   * INT-270 / INT-130 — PaymentStatusChanged → invoice Paid (BR-11).
   * Idempotent when already Paid; ignores non-succeeded statuses.
   */
  async applyPaymentStatusChanged(input: {
    invoiceId: string;
    paymentId: string;
    status: string;
  }): Promise<InvoiceRecord | undefined> {
    return this.tx.run(() => this.performApplyPaymentStatusChanged(input));
  }

  private async performApplyPaymentStatusChanged(input: {
    invoiceId: string;
    paymentId: string;
    status: string;
  }): Promise<InvoiceRecord | undefined> {
    const normalized = input.status.toLowerCase();
    if (normalized !== "succeeded" && normalized !== "paid") {
      return undefined;
    }
    const row = this.store.get(input.invoiceId);
    if (!row) return undefined;
    if (row.status === "Paid") {
      return row;
    }
    return this.applyStatus(row, {
      status: "Paid",
      reason: `payment:${input.paymentId}`,
      actorId: "00000000-0000-4000-8000-000000000002",
      source: "payment",
    });
  }

  listStatusAudit(invoiceId: string) {
    const row = this.store.get(invoiceId);
    if (!row) throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    return row.statusAudit;
  }

  private async applyStatus(
    row: InvoiceRecord,
    input: {
      status: InvoiceStatus;
      reason: string;
      actorId: string;
      source: "manual" | "payment" | "mark_overdue";
    },
  ): Promise<InvoiceRecord> {
    const at = new Date().toISOString();
    const next: InvoiceRecord = {
      ...row,
      status: input.status,
      statusAudit: [
        ...row.statusAudit,
        {
          actorId: input.actorId,
          status: input.status,
          reason: input.reason,
          at,
          source: input.source,
        },
      ],
    };
    this.store.put(next);

    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: row.invoiceId,
      type: "InvoiceStatusChanged",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        invoiceId: row.invoiceId,
        status: input.status,
        reason: input.reason,
        outstanding: input.status === "Paid" ? "0.00" : row.total,
      },
    });

    // REQ-044 / REQ-030 — audit trail for AC-12 (identifiers only).
    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: row.invoiceId,
      type: "AuditableActionPerformed",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        actorId: input.actorId,
        action: `invoice.status.${input.source}`,
        target: `invoice:${row.invoiceId}`,
        timestamp: at,
      },
    });

    // REQ-059 — statement status follows its invoices, in the same transaction.
    await this.statements.recomputeForInvoice(row.invoiceId);

    return next;
  }

  /**
   * REQ-013 / INT-275 — retain invoice rows; emit ErasureCompleted (AC-06).
   */
  async applyErasureRequested(input: {
    requestId: string;
    participantId: string;
  }): Promise<{ result: "completed" | "failed"; invoicesRetained: number }> {
    return this.tx.run(() => this.performApplyErasureRequested(input));
  }

  private async performApplyErasureRequested(input: {
    requestId: string;
    participantId: string;
  }): Promise<{ result: "completed" | "failed"; invoicesRetained: number }> {
    const invoices = this.store.listByParticipant(input.participantId);
    const communityId = invoices[0]?.communityId ?? "a1000000-0000-4000-8000-000000000001";
    await this.outbox.append({
      aggregateType: "DataSubjectRequest",
      aggregateId: input.requestId,
      type: "ErasureCompleted",
      producer: PRODUCER,
      communityId,
      billingMode: "virtual",
      data: {
        requestId: input.requestId,
        module: "AC-06",
        result: "completed",
      },
    });
    return { result: "completed", invoicesRetained: invoices.length };
  }

  private toPublicInvoice(row: InvoiceRecord): Record<string, unknown> {
    return {
      invoiceId: row.invoiceId,
      legalNumber: row.legalNumber ?? undefined,
      producerId: row.producerId,
      consumerId: row.consumerId,
      currency: row.currency,
      status: row.status,
      dueDate: row.dueDate,
      pairSettlementId: row.settlementId,
      tradeIds: row.tradeIds,
      lines: row.lines ?? [],
      amounts: {
        energy: row.energyAmount ?? row.total,
        vat: row.vatAmount ?? "0.00",
        total: row.total,
      },
      billingMode: "virtual",
    };
  }
}

const ALLOWED_STATUSES = new Set<InvoiceStatus>([
  "Draft",
  "Open",
  "PartiallyPaid",
  "Paid",
  "Overdue",
  "Void",
  "Disputed",
]);
