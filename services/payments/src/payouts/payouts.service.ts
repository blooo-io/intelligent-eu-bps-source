import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  BILLING_MODE_RESOLVER,
  OutboxService,
  PassthroughTransaction,
  StaticBillingModeResolver,
  type BillingModeResolver,
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
/** B1 — operator alert when funds have sat on Connect for 70 days (Stripe caps ~90). */
const HOLDING_LIMIT_ALERT_DAYS = 70;
/** B1 — force-payout available balance at day 80 regardless of debtor invoice status. */
const HOLDING_LIMIT_FORCE_DAYS = 80;
/** Synthetic period key for B1 forced holding-limit payouts (not a billing month). */
const HOLDING_LIMIT_PERIOD = "_holding_limit";

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
    @Optional()
    @Inject(BILLING_MODE_RESOLVER)
    private readonly billingMode: BillingModeResolver | null = null,
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

  /**
   * REQ-015 / A7 — EWDS requestWithdrawal target (actorId + currency only).
   * Picks the earliest withdrawable period matching the currency.
   */
  async requestWithdrawalForActor(input: {
    actorId: string;
    currency: string;
  }): Promise<PayoutRecord> {
    const { participantId, communityId, withdrawable } =
      await this.listForParticipant(input.actorId).then(async (listed) => {
        const caller = await this.resolveCaller(input.actorId);
        const account = await this.accountOf(caller.participantId);
        return {
          participantId: caller.participantId,
          communityId: caller.communityId ?? account?.communityId,
          withdrawable: listed.withdrawable,
        };
      });
    if (!communityId) {
      throw refuse("kyc_required");
    }
    const currency = input.currency.toUpperCase();
    const match = withdrawable.find((w) => w.currency === currency);
    if (!match) {
      throw refuse("nothing_to_pay_out");
    }
    return this.requestWithdrawal({
      participantId,
      communityId,
      period: match.period,
      trigger: "participant",
    });
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
    const settings = await this.settings.get(communityId);
    // B1 forced holding-limit payouts run even when autoPayout is off.
    const accounts = await this.payoutAccountsOf(communityId);

    for (const account of accounts) {
      const participantId = account.participantId;
      if (settings.autoPayout) {
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
      }
      // B1 — day 80 force before the day-70 alert so a forced run is not double-logged.
      if (this.holdsFundsPastForce(participantId) && account.pspAccountRef) {
        const forced = await this.forceHoldingLimitPayout({
          participantId,
          communityId,
          accountRef: account.pspAccountRef,
        });
        if (forced === "requested") run.requested += 1;
        else if (forced === "blocked") run.blocked += 1;
      } else if (this.holdsFundsNearLimit(participantId)) {
        run.nearHoldingLimit.push(participantId);
      }
    }
    if (run.nearHoldingLimit.length > 0) {
      this.logger.warn(
        `payout.holding_limit_alert_day70 communityId=${communityId} participantIds=${run.nearHoldingLimit.join(",")}`,
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
    // Remediation §2 / Task 1.16 — canonical key po:<participantId>:<period>.
    const idempotencyKey = `po:${record.participantId}:${record.period}`;
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
    const resolver =
      this.billingMode ?? new StaticBillingModeResolver("virtual");
    // REQ-043 — community live|virtual from AC-03 settings.
    const billingMode = await resolver.modeOf(row.communityId);
    await this.outbox.append({
      aggregateType: "Payout",
      aggregateId: row.payoutId,
      type: "PayoutStatusChanged",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode,
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

  /** Age in ms of the oldest succeeded payment not covered by a live payout. */
  private oldestUnpaidSettledAgeMs(participantId: string): number | null {
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
    if (settled.length === 0) return null;
    return this.clock.now().getTime() - Math.min(...settled);
  }

  /** B1 — day 70 operator alert (funds approaching Stripe's ~90-day cap). */
  private holdsFundsNearLimit(participantId: string): boolean {
    const age = this.oldestUnpaidSettledAgeMs(participantId);
    if (age === null) return false;
    return (
      age >= HOLDING_LIMIT_ALERT_DAYS * DAY_MS &&
      age < HOLDING_LIMIT_FORCE_DAYS * DAY_MS
    );
  }

  /** B1 — day 80 forced payout of available Connect balance. */
  private holdsFundsPastForce(participantId: string): boolean {
    const age = this.oldestUnpaidSettledAgeMs(participantId);
    return age !== null && age >= HOLDING_LIMIT_FORCE_DAYS * DAY_MS;
  }

  /**
   * B1 — payout available balance without the A2 "all invoices Paid" gate.
   * Idempotent on `po:<participantId>:_holding_limit`.
   */
  private async forceHoldingLimitPayout(input: {
    participantId: string;
    communityId: string;
    accountRef: string;
  }): Promise<"requested" | "blocked" | "skipped"> {
    const live = this.payouts
      .listForParticipant(input.participantId)
      .find(
        (p) =>
          p.period === HOLDING_LIMIT_PERIOD &&
          ACTIVE_PAYOUT_STATUSES.includes(p.status),
      );
    if (live) return "skipped";

    const balance = await this.psp.getAvailableBalance(input.accountRef, "EUR");
    if (toCents(balance.amount) <= 0n) return "skipped";

    const record: PayoutRecord = {
      payoutId: randomUUID(),
      participantId: input.participantId,
      communityId: input.communityId,
      period: HOLDING_LIMIT_PERIOD,
      amount: balance.amount,
      currency: balance.currency,
      status: "requested",
      trigger: "auto",
      attempt: 1,
      pspPayoutRef: null,
      invoiceIds: [],
      requestedAt: this.clock.now().toISOString(),
    };
    this.payouts.put(record);
    this.logger.warn(
      `payout.holding_limit_force_day80 communityId=${input.communityId} participantId=${input.participantId}`,
    );
    // Idempotency key shape from remediation §2: po:<participantId>:<period>.
    const idempotencyKey = `po:${input.participantId}:${HOLDING_LIMIT_PERIOD}`;
    try {
      const result = await this.psp.createPayout(
        input.accountRef,
        record.amount,
        record.currency,
        idempotencyKey,
      );
      const next: PayoutRecord = {
        ...record,
        status: statusOf(result),
        pspPayoutRef: result.pspPayoutRef,
        ...(result.arrivalDate ? { arrivalDate: result.arrivalDate } : {}),
        ...(result.failureCategory
          ? { failureCategory: result.failureCategory }
          : {}),
      };
      this.payouts.put(next);
      await this.announce(next);
      return next.status === "failed" ? "blocked" : "requested";
    } catch (error) {
      if (!(error instanceof PspError)) throw error;
      this.payouts.put({
        ...record,
        status: "failed",
        failureCategory: error.code,
      });
      return "blocked";
    }
  }

  private async accountOf(participantId: string): Promise<AccountRecord | undefined> {
    const row = this.payments.getAccount(participantId) ?? (await this.accounts.get(participantId));
    if (row) this.payments.putAccount(row);
    return row;
  }
}
