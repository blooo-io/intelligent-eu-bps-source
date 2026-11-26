import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  BILLING_MODE_RESOLVER,
  OutboxService,
  PassthroughTransaction,
  StaticBillingModeResolver,
  type BillingModeResolver,
  type RecordingTransaction,
} from "@intelligent/module-template";
import { sumMoney } from "../domain/money.js";
import { InvoiceStore, type InvoiceWrite } from "../domain/store.js";
import type {
  InvoiceRecord,
  InvoiceReminder,
  InvoiceStatus,
  InvoiceSummary,
  PairSettlementInput,
} from "../domain/types.js";
import {
  INVOICE_RENDERER,
  renderInvoicePdf,
  type InvoiceRenderer,
} from "../pdf/invoice-pdf.renderer.js";
import {
  INVOICE_PARTY_PORT,
  StubInvoiceParty,
  type InvoicePartyPort,
} from "../ports/invoice-party.port.js";
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
const SCHEDULED_REMINDER_ACTOR = "00000000-0000-4000-8000-000000000003";

/** Statuses that accept a payment reminder (REQ-061). */
const REMINDABLE_STATUSES = new Set<InvoiceStatus>([
  "Open",
  "Overdue",
  "PartiallyPaid",
]);

function reminderIntervalDays(): number {
  const raw = Number(process.env.REMINDER_INTERVAL_DAYS ?? "7");
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
}

function reminderMax(): number {
  const raw = Number(process.env.REMINDER_MAX ?? "3");
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((b - a) / 86_400_000);
}

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
    @Optional()
    @Inject(BILLING_MODE_RESOLVER)
    private readonly billingMode: BillingModeResolver | null = null,
    @Optional()
    @Inject(INVOICE_RENDERER)
    private readonly renderer: InvoiceRenderer | null = null,
    @Optional()
    @Inject(INVOICE_PARTY_PORT)
    private readonly parties: InvoicePartyPort | null = null,
  ) {}

  private partyPort(): InvoicePartyPort {
    return this.parties ?? new StubInvoiceParty();
  }

  private renderPdf(invoice: InvoiceRecord): Promise<Uint8Array> {
    return (this.renderer ?? renderInvoicePdf)(invoice);
  }

  /** REQ-043 — community live|virtual from AC-03 settings. */
  private async modeOf(communityId: string) {
    const resolver =
      this.billingMode ?? new StaticBillingModeResolver("virtual");
    return resolver.modeOf(communityId);
  }

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
   * INT-463 — caller is participantId / actorId (no IdP `sub` bridge).
   */
  async resolveCallerIds(sub: string): Promise<string[]> {
    return [sub];
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
    return Promise.all(
      this.store
        .list()
        .filter((row) => this.isCallerOnInvoice(row, set))
        .map((row) => this.toPublicInvoice(row)),
    );
  }

  /**
   * REQ-013 / Task 3.19 — invoices where the participant is issuer (producer)
   * or addressee (consumer), ordered by period for the DSAR export.
   */
  async listForParticipant(participantId: string): Promise<InvoiceSummary[]> {
    return this.store
      .listByParticipant(participantId)
      .map((row) => ({
        invoiceId: row.invoiceId,
        legalNumber: row.legalNumber,
        period: row.period,
        partyRole:
          row.producerId === participantId
            ? ("issuer" as const)
            : ("addressee" as const),
        total: row.total,
        currency: row.currency,
        status: row.status,
        issuedAt: row.issuedAt ?? null,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
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
    return await this.toPublicInvoice(row);
  }

  /**
   * REQ-039 / A6 / UAT-050 — billing-stored PDF for a member on the invoice
   * or a manager of the invoice community (REQ-049).
   */
  async getDocumentForCaller(
    invoiceId: string,
    caller: { sub: string; roles: string[]; communityId?: string },
  ): Promise<{ legalNumber: string; content: Buffer }> {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    const isManager = caller.roles.includes("manager");
    if (isManager) {
      if (!caller.communityId || caller.communityId !== row.communityId) {
        throw new NotFoundException(`Unknown invoice ${invoiceId}`);
      }
    } else {
      const callerIds = await this.resolveCallerIds(caller.sub);
      if (!this.isCallerOnInvoice(row, callerIds)) {
        throw new NotFoundException(`Unknown invoice ${invoiceId}`);
      }
    }
    return this.requireStoredDocument(row, invoiceId);
  }

  /** REQ-039 — internal GetInvoiceDocument (service role). */
  getDocument(invoiceId: string): { legalNumber: string; content: Buffer } {
    const row = this.store.get(invoiceId);
    if (!row) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    return this.requireStoredDocument(row, invoiceId);
  }

  private requireStoredDocument(
    row: InvoiceRecord,
    invoiceId: string,
  ): { legalNumber: string; content: Buffer } {
    if (!row.legalNumber) {
      throw new NotFoundException(`No document for invoice ${invoiceId}`);
    }
    const content = this.store.getDocument(invoiceId);
    if (!content) {
      throw new NotFoundException(`No document for invoice ${invoiceId}`);
    }
    return { legalNumber: row.legalNumber, content };
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

    const gridFee = settlement.gridFeeAmount ?? "0.00";
    const levy = settlement.levyAmount ?? "0.00";
    const tax = settlement.taxAmount ?? "0.00";
    // Skip zero-amount carry-forward rows (BR-05) — energy + tariff lines only.
    if (sumMoney(settlement.energyAmount, gridFee, levy, tax) === "0.00") {
      return null;
    }

    // BR-09 — hold until producer terms + KYC (CheckReadiness).
    const ready = await this.readiness.check(settlement.producerId);
    if (!ready.ready) {
      throw new BadRequestException(
        ready.reason ?? "producer not ready for self-billing",
      );
    }

    // REQ-039 / REQ-054 — issuer and addressee from AC-03 (retryable when missing).
    const parties = this.partyPort();
    const producerParty = await parties.getInvoiceParty(settlement.producerId);
    if (!producerParty) {
      throw new BadRequestException(
        "producer not ready: self-billing mandate missing",
      );
    }
    if (!producerParty.selfBillingMandate) {
      throw new BadRequestException(
        "producer not ready: self-billing mandate missing",
      );
    }
    const consumerParty = await parties.getInvoiceParty(settlement.consumerId);
    if (!consumerParty) {
      throw new BadRequestException(
        "producer not ready: consumer billing profile missing",
      );
    }

    const issuedAt = new Date().toISOString();
    const dueDate = new Date(issuedAt);
    dueDate.setUTCDate(dueDate.getUTCDate() + 14);
    const due = dueDate.toISOString().slice(0, 10);

    // BR-08 — total from energy + tariff lines + VAT.
    const total = sumMoney(
      settlement.energyAmount,
      gridFee,
      levy,
      tax,
      settlement.vat,
    );
    const amounts = {
      energy: settlement.energyAmount,
      gridFee,
      levy,
      tax,
      vat: settlement.vat,
      total,
    };
    const tariffApplied = Boolean(settlement.tariffId);

    // BR-10 / REQ-042 — assign inside the issue transaction (A6).
    // Put only after a successful render so a failed render leaves no gap.
    const legalNumber = this.store.nextLegalNumber(settlement.producerId);

    const invoiceId = randomUUID();
    const exchangeRate =
      settlement.currency === "EUR" || !settlement.rateDate
        ? null
        : { rate: settlement.rate, rateDate: settlement.rateDate };

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
      reminders: [],
      issuedAt,
      issuer: {
        participantId: settlement.producerId,
        name: producerParty.name || "Producer",
        address: producerParty.address,
      },
      addressee: {
        participantId: settlement.consumerId,
        name: consumerParty.name || "Consumer",
        address: consumerParty.address,
      },
      mandate: producerParty.selfBillingMandate,
      amounts,
      vatRate: settlement.vatRate ?? 0,
      exchangeRate,
      tariffId: settlement.tariffId ?? null,
      totalKWh: settlement.kWh,
      carriedForwardIn: settlement.carriedForwardIn ?? "0.00",
      settlementType: settlement.settlementType ?? "periodic",
      document: null,
    };

    // REQ-039 / UAT-050 — render and store PDF + sha256 at issue.
    const bytes = Buffer.from(await this.renderPdf(record));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    record.document = { sha256, byteLength: bytes.byteLength };
    this.store.put(record);
    this.store.putDocument(invoiceId, sha256, bytes);

    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: invoiceId,
      type: "InvoiceIssued",
      producer: PRODUCER,
      communityId: settlement.communityId,
      billingMode: await this.modeOf(settlement.communityId),
      data: {
        invoiceId,
        issuerId: settlement.producerId,
        recipientId: settlement.consumerId,
        // Task 2.2 / REQ-004 — full amount split; NFR-015 — no legalNumber, no names.
        amounts,
        tariffApplied,
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
        exchangeRate,
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
   * REQ-061 / UAT-078 — manager or scheduled payment reminder.
   * 409 unless Open | Overdue | PartiallyPaid; REQ-049 community scope → 404.
   */
  async sendReminder(
    invoiceId: string,
    input: {
      actorId: string;
      communityId?: string;
      trigger: "manual" | "scheduled";
      /** Calendar date for scheduled cadence (defaults to today UTC). */
      asOf?: string;
    },
  ): Promise<{ invoiceId: string; reminderCount: number }> {
    return this.tx.run(() => this.performSendReminder(invoiceId, input));
  }

  private async performSendReminder(
    invoiceId: string,
    input: {
      actorId: string;
      communityId?: string;
      trigger: "manual" | "scheduled";
      asOf?: string;
    },
  ): Promise<{ invoiceId: string; reminderCount: number }> {
    const row = this.store.get(invoiceId);
    if (!row) throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    if (
      input.communityId !== undefined &&
      row.communityId !== input.communityId
    ) {
      throw new NotFoundException(`Unknown invoice ${invoiceId}`);
    }
    if (!REMINDABLE_STATUSES.has(row.status)) {
      throw new ConflictException(
        `invoice ${invoiceId} cannot be reminded in status ${row.status}`,
      );
    }

    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
    const reminders = [...(row.reminders ?? [])];
    const reminderNumber = reminders.length + 1;
    const entry: InvoiceReminder = {
      sentOn: asOf,
      trigger: input.trigger,
      reminderNumber,
    };
    reminders.push(entry);
    this.store.put({ ...row, reminders });

    await this.outbox.append({
      aggregateType: "Invoice",
      aggregateId: invoiceId,
      type: "PaymentReminderRequested",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: await this.modeOf(row.communityId),
      data: {
        invoiceId,
        recipientId: row.consumerId,
        communityId: row.communityId,
        dueDate: row.dueDate,
        outstanding: row.total,
        currency: row.currency,
        reminderNumber,
        trigger: input.trigger,
      },
    });

    if (input.trigger === "manual") {
      await this.outbox.append({
        aggregateType: "Invoice",
        aggregateId: invoiceId,
        type: "AuditableActionPerformed",
        producer: PRODUCER,
        communityId: row.communityId,
        billingMode: await this.modeOf(row.communityId),
        data: {
          actorId: input.actorId,
          action: "invoice.reminder.manual",
          target: `invoice:${invoiceId}`,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return { invoiceId, reminderCount: reminders.length };
  }

  /**
   * REQ-061 — batch scheduled reminders for Overdue invoices (AC-14 SendReminders).
   * Cadence: first scheduled, then every REMINDER_INTERVAL_DAYS, at most REMINDER_MAX.
   */
  async sendDueReminders(
    asOf: string,
  ): Promise<{ accepted: true; sent: number }> {
    return this.tx.run(() => this.performSendDueReminders(asOf));
  }

  private async performSendDueReminders(
    asOf: string,
  ): Promise<{ accepted: true; sent: number }> {
    if (!asOf) {
      throw new BadRequestException("asOf is required");
    }
    const interval = reminderIntervalDays();
    const max = reminderMax();
    let sent = 0;
    for (const row of this.store.list()) {
      if (row.status !== "Overdue") continue;
      const scheduled = (row.reminders ?? []).filter(
        (r) => r.trigger === "scheduled",
      );
      if (scheduled.length >= max) continue;
      const last = scheduled[scheduled.length - 1];
      if (last && daysBetween(last.sentOn, asOf) < interval) continue;
      await this.performSendReminder(row.invoiceId, {
        actorId: SCHEDULED_REMINDER_ACTOR,
        trigger: "scheduled",
        asOf,
      });
      sent += 1;
    }
    return { accepted: true, sent };
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
    return await this.toPublicInvoice(next);
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
      billingMode: await this.modeOf(row.communityId),
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
      billingMode: await this.modeOf(row.communityId),
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
      billingMode: await this.modeOf(communityId),
      data: {
        requestId: input.requestId,
        module: "AC-06",
        result: "completed",
      },
    });
    return { result: "completed", invoicesRetained: invoices.length };
  }

  private async toPublicInvoice(row: InvoiceRecord): Promise<Record<string, unknown>> {
    // REQ-007 / REQ-004 — six contract amount fields on the public Invoice.
    const amounts = row.amounts ?? {
      energy: row.energyAmount ?? row.total,
      gridFee: "0.00",
      levy: "0.00",
      tax: "0.00",
      vat: row.vatAmount ?? "0.00",
      total: row.total,
    };
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
      amounts,
      tariffApplied: Boolean(row.tariffId),
      billingMode: await this.modeOf(row.communityId),
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
