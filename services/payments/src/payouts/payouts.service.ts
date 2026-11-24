import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import { CLOCK, type Clock } from "../domain/clock.js";
import { decidePayout, fromCents, toCents, type PayoutStatementView } from "../domain/payout.js";
import {
  ACTIVE_PAYOUT_STATUSES,
  PayoutsStore,
  type PayoutRecord,
  type PayoutStatus,
} from "../domain/payouts.store.js";
import { PaymentsStore, type AccountRecord } from "../domain/store.js";
import type { JournalWrite } from "../persistence/payment-journal.js";
import { COMMUNITY_SETTINGS, type CommunitySettingsPort } from "../ports/community-settings.port.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "../ports/participants-resolver.port.js";
import {
  PAYMENT_ACCOUNTS_STORE,
  type PaymentAccountsStore,
} from "../ports/payment-accounts.store.js";
import { STATEMENT_LOOKUP, type StatementLookupPort } from "../ports/statement-lookup.port.js";
import { PAYOUT_PORT, type PayoutPort, type PayoutResult } from "../psp/payout.port.js";
import type { PayoutEventsHandler } from "../psp/psp-events.port.js";
import { PspError, type PspEvent } from "../psp/psp.types.js";

const PRODUCER = "AC-07";

export type WithdrawalRequest = {
  participantId: string;
  communityId: string;
  period: string;
  trigger: "participant" | "auto";
};

export type PayoutRefusalReason =
  | "kyc_required"
  | "statement_not_found"
  | "producer_invoices_unpaid"
  | "nothing_to_pay_out"
  | "funds_pending";

export type WithdrawableView = { period: string; amount: string; currency: string };

export type AutoPayoutRun = { requested: number; blocked: number; nearHoldingLimit: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Stripe holds manual-payout funds at most 90 days outside the US/TH; flag them 15 days earlier. */
const HOLDING_LIMIT_WARNING_DAYS = 75;

function refuse(reason: PayoutRefusalReason): ConflictException {
  return new ConflictException({ reason });
}

export type PayoutWebhook = {
  payoutRef: string;
  status: PayoutStatus;
  accountRef: string;
  arrivalDate?: string;
  failureCategory?: string;
};

const WEBHOOK_STATUS: Partial<Record<PspEvent["kind"], PayoutStatus>> = {
  "payout.paid": "paid",
  "payout.failed": "failed",
  "payout.canceled": "canceled",
};

const TERMINAL_PAYOUT_STATUSES: readonly PayoutStatus[] = ["paid", "failed", "canceled"];

/** What the participant sold in the period: its non-Void producer invoices. */
function totalSold(participantId: string, statement: PayoutStatementView): bigint {
  return statement.invoices
    .filter((i) => i.producerId === participantId && i.status !== "Void")
    .reduce((sum, i) => sum + toCents(i.total), 0n);
}

function statusOf(result: PayoutResult): PayoutStatus {
  return result.status === "pending" ? "in_transit" : result.status;
}

/** Terminal states are never left, except a bank return after `paid` (`paid → failed`). */
function canMove(from: PayoutStatus, to: PayoutStatus): boolean {
  if (from === to || to === "requested") return false;
  if (TERMINAL_PAYOUT_STATUSES.includes(from)) return from === "paid" && to === "failed";
  return true;
}

/**
 * AC-07 participant withdrawal (REQ-015, UAT-015, REQ-060). Payouts are manual
 * on the producer's PSP account; one period is paid out at most once at a time.
 * `requestWithdrawal` is also the entry point of the EWDS `requestWithdrawal` command (A7).
 */
@Injectable()
export class PayoutsService implements PayoutEventsHandler {
  private readonly logger = new Logger(PayoutsService.name);
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();

  constructor(
    @Inject(PayoutsStore) private readonly payouts: PayoutsStore,
    @Inject(PaymentsStore) private readonly payments: PaymentsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PAYOUT_PORT) private readonly psp: PayoutPort,
    @Inject(STATEMENT_LOOKUP) private readonly statements: StatementLookupPort,
    @Inject(PARTICIPANTS_RESOLVER) private readonly idpResolver: ParticipantsResolverPort,
    @Inject(PAYMENT_ACCOUNTS_STORE) private readonly accounts: PaymentAccountsStore,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(COMMUNITY_SETTINGS) private readonly settings: CommunitySettingsPort,
  ) {}

  useTransaction(tx: RecordingTransaction<JournalWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

  resetStore(): void {
    this.payouts.reset();
  }

  requestWithdrawal(input: WithdrawalRequest): Promise<PayoutRecord> {
    return this.tx.run(() => this.performRequestWithdrawal(input));
  }

  /** PAYOUT_EVENTS_HANDLER — runs inside the webhook transaction, after event-id dedupe (04 §7). */
  async onPayoutEvent(event: PspEvent): Promise<void> {
    const status = WEBHOOK_STATUS[event.kind];
    if (!status || !event.pspPayoutRef) return;
    await this.applyPayoutWebhook({
      payoutRef: event.pspPayoutRef,
      status,
      accountRef: event.pspAccountRef ?? "",
      ...(event.arrivalDate ? { arrivalDate: event.arrivalDate } : {}),
      ...(event.failureCategory ? { failureCategory: event.failureCategory } : {}),
    });
  }

  applyPayoutWebhook(payload: PayoutWebhook): Promise<void> {
    return this.tx.run(() => this.performApplyPayoutWebhook(payload));
  }

  /**
   * AC-14 RunAutoPayouts (REQ-015). With `autoPayout` on, requests a payout for every
   * period a verified producer has sold in and has no live payout for. A2 refusals
   * and PSP refusals count as `blocked`; any other error fails the job.
   */
  async runAutoPayouts(input: { communityId: string }): Promise<AutoPayoutRun> {
    const { communityId } = input;
    const run: AutoPayoutRun = { requested: 0, blocked: 0, nearHoldingLimit: [] };
    if (!(await this.settings.get(communityId)).autoPayout) return run;

    for (const account of await this.payoutAccountsOf(communityId)) {
      const participantId = account.participantId;
      const live = new Set(
        this.payouts
          .listForParticipant(participantId)
          .filter((p) => ACTIVE_PAYOUT_STATUSES.includes(p.status))
          .map((p) => p.period),
      );
      const statements = (await this.statements.list(participantId))
        .filter((s) => !live.has(s.period) && totalSold(participantId, s) > 0n)
        .sort((a, b) => a.period.localeCompare(b.period));
      for (const statement of statements) {
        try {
          const row = await this.requestWithdrawal({
            participantId,
            communityId,
            period: statement.period,
            trigger: "auto",
          });
          if (row.status === "failed") run.blocked += 1;
          else run.requested += 1;
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error;
          run.blocked += 1;
        }
      }
      if (this.holdsFundsNearLimit(participantId)) run.nearHoldingLimit.push(participantId);
    }
    if (run.nearHoldingLimit.length > 0) {
      this.logger.warn(
        `payout.near_holding_limit communityId=${communityId} participantIds=${run.nearHoldingLimit.join(",")}`,
      );
    }
    return run;
  }

  async listForParticipant(
    subOrParticipantId: string,
  ): Promise<{ items: PayoutRecord[]; withdrawable: WithdrawableView[] }> {
    const { participantId } = await this.resolveCaller(subOrParticipantId);
    const items = this.payouts.listForParticipant(participantId);
    const active = new Set(
      items.filter((p) => ACTIVE_PAYOUT_STATUSES.includes(p.status)).map((p) => p.period),
    );
    const withdrawable: WithdrawableView[] = [];
    const statements = await this.statements.list(participantId);
    for (const statement of [...statements].sort((a, b) => a.period.localeCompare(b.period))) {
      if (active.has(statement.period)) continue;
      const decision = this.decide(participantId, statement);
      if (decision.eligible) {
        withdrawable.push({ period: statement.period, amount: decision.amount, currency: statement.currency });
      }
    }
    return { items, withdrawable };
  }

  private async performRequestWithdrawal(input: WithdrawalRequest): Promise<PayoutRecord> {
    const caller = await this.resolveCaller(input.participantId);
    const participantId = caller.participantId;
    const communityId = caller.communityId ?? input.communityId;

    const account = await this.accountOf(participantId);
    if (!account || account.kycStatus !== "verified" || !account.pspAccountRef) {
      throw refuse("kyc_required");
    }
    const accountRef = account.pspAccountRef;

    const attempts = this.payouts.listForPeriod(participantId, input.period);
    const current = attempts.find((p) => ACTIVE_PAYOUT_STATUSES.includes(p.status));
    if (current?.status === "requested") {
      // The PSP never confirmed this attempt: retry under its own idempotency key.
      return this.submit(current, accountRef);
    }
    if (current) return current;

    const [statement] = await this.statements.list(participantId, input.period);
    const decision = this.decide(participantId, statement ?? null);
    if (!decision.eligible) throw refuse(decision.reason);

    const currency = statement!.currency;
    const balance = await this.psp.getAvailableBalance(accountRef, currency);
    // The PSP debits a payout at creation; only unconfirmed attempts are still in the balance.
    const unconfirmed = this.payouts
      .listForParticipant(participantId)
      .filter((p) => p.status === "requested" && p.currency === currency)
      .reduce((sum, p) => sum + toCents(p.amount), 0n);
    if (toCents(balance.amount) - unconfirmed < toCents(decision.amount)) {
      throw refuse("funds_pending");
    }

    const record: PayoutRecord = {
      payoutId: randomUUID(),
      participantId,
      communityId,
      period: input.period,
      amount: decision.amount,
      currency,
      status: "requested",
      trigger: input.trigger,
      attempt: attempts.reduce((max, p) => Math.max(max, p.attempt), 0) + 1,
      pspPayoutRef: null,
      invoiceIds: decision.invoiceIds,
      requestedAt: this.clock.now().toISOString(),
    };
    this.payouts.put(record);
    return this.submit(record, accountRef);
  }

  private async performApplyPayoutWebhook(payload: PayoutWebhook): Promise<void> {
    const record = this.payouts.findByPspPayoutRef(payload.payoutRef);
    if (!record) return;
    const account = await this.accountOf(record.participantId);
    if (account?.pspAccountRef !== payload.accountRef) {
      this.logger.warn(`payout.webhook_account_mismatch payoutId=${record.payoutId}`);
      return;
    }
    if (!canMove(record.status, payload.status)) return;
    const next: PayoutRecord = {
      ...record,
      status: payload.status,
      ...(payload.arrivalDate ? { arrivalDate: payload.arrivalDate } : {}),
      ...(payload.status === "failed" ? { failureCategory: payload.failureCategory ?? "other" } : {}),
    };
    this.payouts.put(next);
    await this.announce(next);
  }

  private async submit(record: PayoutRecord, accountRef: string): Promise<PayoutRecord> {
    const idempotencyKey = `payout:${record.participantId}:${record.period}:${record.attempt}`;
    let next: PayoutRecord;
    try {
      const result = await this.psp.createPayout(accountRef, record.amount, record.currency, idempotencyKey);
      next = {
        ...record,
        status: statusOf(result),
        pspPayoutRef: result.pspPayoutRef,
        ...(result.arrivalDate ? { arrivalDate: result.arrivalDate } : {}),
        ...(result.failureCategory ? { failureCategory: result.failureCategory } : {}),
      };
    } catch (error) {
      // Anything but an explicit PSP refusal leaves the attempt `requested`, to be resumed.
      if (!(error instanceof PspError)) throw error;
      next = { ...record, status: "failed", failureCategory: error.code };
    }
    this.payouts.put(next);
    await this.announce(next);
    return next;
  }

  private decide(participantId: string, statement: PayoutStatementView | null) {
    const invoiceIds = new Set(statement?.invoices.map((i) => i.invoiceId) ?? []);
    const payments = [...invoiceIds].flatMap((invoiceId) =>
      this.payments.listByInvoiceId(invoiceId).map((p) => ({
        invoiceId: p.invoiceId,
        payeeId: p.payeeId,
        status: p.status,
        amount: p.amount,
        pspFee: p.feeAmount,
      })),
    );
    return decidePayout({ participantId, statement, payments });
  }

  private async announce(row: PayoutRecord): Promise<void> {
    await this.outbox.append({
      aggregateType: "Payout",
      aggregateId: row.payoutId,
      type: "PayoutStatusChanged",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        payoutId: row.payoutId,
        participantId: row.participantId,
        period: row.period,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        ...(row.failureCategory ? { failureCategory: row.failureCategory } : {}),
      },
    });
  }

  /** INT-230 — a JWT `sub` may be the IdP user id; AC-03 maps it to the participant. */
  private async resolveCaller(
    subOrParticipantId: string,
  ): Promise<{ participantId: string; communityId?: string }> {
    const resolved = await this.idpResolver.resolveByIdpSub(subOrParticipantId);
    return resolved ?? { participantId: subOrParticipantId };
  }

  /** Verified Connect accounts of the community; the in-memory row wins over the durable one. */
  private async payoutAccountsOf(communityId: string): Promise<AccountRecord[]> {
    const byId = new Map<string, AccountRecord>();
    for (const row of await this.accounts.listByCommunity(communityId)) byId.set(row.participantId, row);
    for (const row of this.payments.listAccountsByCommunity(communityId)) byId.set(row.participantId, row);
    return [...byId.values()]
      .filter((a) => a.kycStatus === "verified" && a.pspAccountRef)
      .sort((a, b) => a.participantId.localeCompare(b.participantId));
  }

  /** The oldest succeeded payment not yet in a live payout is at least 75 days old. */
  private holdsFundsNearLimit(participantId: string): boolean {
    const paidOut = new Set(
      this.payouts
        .listForParticipant(participantId)
        .filter((p) => ACTIVE_PAYOUT_STATUSES.includes(p.status))
        .flatMap((p) => p.invoiceIds),
    );
    const settled = this.payments
      .listByPayeeId(participantId)
      .filter((p) => p.status === "succeeded" && !paidOut.has(p.invoiceId))
      .map((p) => p.settledAt ?? p.initiatedAt)
      .filter((at): at is string => at !== undefined)
      .map((at) => Date.parse(at));
    if (settled.length === 0) return false;
    return this.clock.now().getTime() - Math.min(...settled) >= HOLDING_LIMIT_WARNING_DAYS * DAY_MS;
  }

  private async accountOf(participantId: string): Promise<AccountRecord | undefined> {
    const row = this.payments.getAccount(participantId) ?? (await this.accounts.get(participantId));
    if (row) this.payments.putAccount(row);
    return row;
  }
}
