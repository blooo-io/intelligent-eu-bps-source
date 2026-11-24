/**
 * REQ-015 / REQ-060 / UAT-015 — participant withdrawal and payout records (INT-426).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { InMemoryOutboxStore, OutboxService } from "@intelligent/module-template";
import type { Clock } from "../domain/clock.js";
import { PayoutsStore } from "../domain/payouts.store.js";
import { PaymentsStore, type AccountRecord, type PaymentRecord } from "../domain/store.js";
import { InMemoryCommunitySettings } from "../ports/community-settings.port.js";
import { InMemoryPaymentAccountsStore } from "../ports/payment-accounts.store.js";
import type { ParticipantsResolverPort } from "../ports/participants-resolver.port.js";
import { InMemoryStatementLookup } from "../ports/statement-lookup.port.js";
import type { PayoutPort, PayoutResult } from "../psp/payout.port.js";
import { PspError, type PspEvent } from "../psp/psp.types.js";
import { PayoutsService } from "./payouts.service.js";

const COM = "c0ffee00-1234-4abc-8def-0123456789ab";

class FixedClock implements Clock {
  private tick = 0;
  now(): Date {
    this.tick += 1;
    return new Date(Date.UTC(2026, 10, 24, 9, 0, this.tick));
  }
}

/** Models the PSP: a created payout leaves the available balance at once. */
class FakePayouts implements PayoutPort {
  balance = "0.00";
  private seq = 0;
  next: Partial<PayoutResult> | Error | null = null;
  setManualSchedule = vi.fn(async (_accountRef: string) => undefined);
  getAvailableBalance = vi.fn(async (_accountRef: string, currency: string) => ({
    amount: this.balance,
    currency,
  }));
  createPayout = vi.fn(
    async (_accountRef: string, amount: string, _currency: string, _key: string): Promise<PayoutResult> => {
      const next = this.next;
      this.next = null;
      if (next instanceof Error) throw next;
      this.balance = ((toCents(this.balance) - toCents(amount)) / 100).toFixed(2);
      this.seq += 1;
      return { pspPayoutRef: `po_${this.seq}`, status: "pending", ...next };
    },
  );
}

const toCents = (amount: string): number => Math.round(Number(amount) * 100);

const account = (over: Partial<AccountRecord> = {}): AccountRecord => ({
  participantId: "P",
  pspAccountRef: "acct_P",
  pspPaymentMethodRef: null,
  kycStatus: "verified",
  role: "producer",
  communityId: COM,
  ...over,
});

const payment = (id: string, invoiceId: string, amount: string, pspFee: string): PaymentRecord => ({
  paymentId: id,
  invoiceId,
  participantId: "A",
  payeeId: "P",
  amount,
  currency: "EUR",
  status: "succeeded",
  communityId: COM,
  feeAmount: pspFee,
});

describe("PayoutsService (REQ-015, UAT-015)", () => {
  let payouts: PayoutsStore;
  let payments: PaymentsStore;
  let accounts: InMemoryPaymentAccountsStore;
  let statements: InMemoryStatementLookup;
  let outboxStore: InMemoryOutboxStore;
  let psp: FakePayouts;
  let resolver: ParticipantsResolverPort;
  let settings: InMemoryCommunitySettings;
  let svc: PayoutsService;
  const req = { participantId: "P", communityId: COM, period: "2026-10", trigger: "participant" as const };

  beforeEach(() => {
    payouts = new PayoutsStore();
    payments = new PaymentsStore();
    accounts = new InMemoryPaymentAccountsStore();
    statements = new InMemoryStatementLookup();
    outboxStore = new InMemoryOutboxStore();
    psp = new FakePayouts();
    resolver = { resolveByIdpSub: vi.fn(async () => null) };
    settings = new InMemoryCommunitySettings();
    svc = new PayoutsService(
      payouts,
      payments,
      new OutboxService(outboxStore),
      psp,
      statements,
      resolver,
      accounts,
      new FixedClock(),
      settings,
    );
    payments.putAccount(account());
    statements.put({
      participantId: "P",
      period: "2026-10",
      currency: "EUR",
      invoices: [
        { invoiceId: "iA", producerId: "P", consumerId: "A", total: "12.00", status: "Paid" },
        { invoiceId: "iB", producerId: "P", consumerId: "B", total: "8.50", status: "Paid" },
        { invoiceId: "iC", producerId: "C", consumerId: "P", total: "6.25", status: "Open" },
      ],
    });
    statements.put({
      participantId: "P",
      period: "2026-11",
      currency: "EUR",
      invoices: [{ invoiceId: "iD", producerId: "P", consumerId: "A", total: "5.00", status: "Paid" }],
    });
    payments.putPayment(payment("pA", "iA", "12.00", "0.43"));
    payments.putPayment(payment("pB", "iB", "8.50", "0.37"));
    payments.putPayment(payment("pD", "iD", "5.00", "0.20"));
  });

  const events = async () =>
    (await outboxStore.list()).filter((row) => row.event.type === "PayoutStatusChanged").map((row) => row.event);

  it("UAT-015: a verified producer withdraws 19.70 for 2026-10; one PayoutStatusChanged", async () => {
    psp.balance = "25.00";
    const p = await svc.requestWithdrawal(req);
    expect(p).toMatchObject({
      participantId: "P",
      communityId: COM,
      amount: "19.70",
      currency: "EUR",
      status: "in_transit",
      trigger: "participant",
      attempt: 1,
      pspPayoutRef: "po_1",
      invoiceIds: ["iA", "iB"],
    });
    expect(psp.createPayout).toHaveBeenCalledWith("acct_P", "19.70", "EUR", "payout:P:2026-10:1");
    expect(payouts.get(p.payoutId)).toEqual(p);
    const emitted = await events();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "PayoutStatusChanged",
      producer: "AC-07",
      communityId: COM,
      data: {
        payoutId: p.payoutId,
        participantId: "P",
        period: "2026-10",
        amount: "19.70",
        currency: "EUR",
        status: "in_transit",
      },
    });
  });

  it("a second request for the same period returns the same payout (no second PSP call)", async () => {
    psp.balance = "25.00";
    const first = await svc.requestWithdrawal(req);
    const second = await svc.requestWithdrawal(req);
    expect(second).toEqual(first);
    expect(psp.createPayout).toHaveBeenCalledTimes(1);
    expect(await events()).toHaveLength(1);
  });

  it("after a failed payout, a new request creates attempt 2 with a new idempotency key", async () => {
    psp.balance = "25.00";
    const first = await svc.requestWithdrawal(req);
    payouts.put({ ...payouts.get(first.payoutId)!, status: "failed", failureCategory: "bank_account_invalid" });
    psp.balance = "25.00";
    const second = await svc.requestWithdrawal(req);
    expect(second.attempt).toBe(2);
    expect(second.payoutId).not.toBe(first.payoutId);
    expect(psp.createPayout).toHaveBeenLastCalledWith("acct_P", "19.70", "EUR", "payout:P:2026-10:2");
  });

  it("409 funds_pending when the PSP available balance is below the amount", async () => {
    psp.balance = "10.00";
    await expect(svc.requestWithdrawal(req)).rejects.toMatchObject({
      status: 409,
      response: { reason: "funds_pending" },
    });
    expect(psp.createPayout).not.toHaveBeenCalled();
    expect(payouts.listForParticipant("P")).toEqual([]);
  });

  it("409 funds_pending on a negative PSP balance (refund after payout)", async () => {
    psp.balance = "-3.50";
    await expect(svc.requestWithdrawal(req)).rejects.toMatchObject({ response: { reason: "funds_pending" } });
  });

  it("two eligible periods 19.70 + 4.80 with available 20.00: the second request is 409 funds_pending", async () => {
    psp.balance = "20.00";
    await svc.requestWithdrawal(req);
    await expect(svc.requestWithdrawal({ ...req, period: "2026-11" })).rejects.toMatchObject({
      status: 409,
      response: { reason: "funds_pending" },
    });
  });

  it("an unconfirmed (requested) payout counts against the balance and resumes with the same idempotency key", async () => {
    psp.balance = "20.00";
    psp.next = new Error("socket hang up");
    await expect(svc.requestWithdrawal(req)).rejects.toThrow(/socket hang up/);
    const [stuck] = payouts.listForPeriod("P", "2026-10");
    expect(stuck).toMatchObject({ status: "requested", attempt: 1, pspPayoutRef: null });
    expect(await events()).toHaveLength(0);

    await expect(svc.requestWithdrawal({ ...req, period: "2026-11" })).rejects.toMatchObject({
      response: { reason: "funds_pending" },
    });

    const resumed = await svc.requestWithdrawal(req);
    expect(resumed).toMatchObject({ payoutId: stuck!.payoutId, status: "in_transit", attempt: 1 });
    expect(psp.createPayout).toHaveBeenLastCalledWith("acct_P", "19.70", "EUR", "payout:P:2026-10:1");
  });

  it("a PSP refusal records a failed attempt and emits it", async () => {
    psp.balance = "25.00";
    psp.next = new PspError("insufficient_balance", "race");
    const p = await svc.requestWithdrawal(req);
    expect(p).toMatchObject({ status: "failed", failureCategory: "insufficient_balance", pspPayoutRef: null });
    expect((await events())[0]).toMatchObject({
      data: { status: "failed", failureCategory: "insufficient_balance" },
    });
  });

  it("keeps the PSP status and arrival date when the payout is already paid", async () => {
    psp.balance = "25.00";
    psp.next = { status: "paid", arrivalDate: "2026-11-26" };
    expect(await svc.requestWithdrawal(req)).toMatchObject({ status: "paid", arrivalDate: "2026-11-26" });
  });

  it("409 kyc_required for an unverified account", async () => {
    payments.putAccount(account({ kycStatus: "pending" }));
    await expect(svc.requestWithdrawal(req)).rejects.toMatchObject({
      status: 409,
      response: { reason: "kyc_required" },
    });
  });

  it("409 kyc_required without a Connect account or without any account", async () => {
    payments.putAccount(account({ pspAccountRef: null }));
    await expect(svc.requestWithdrawal(req)).rejects.toMatchObject({ response: { reason: "kyc_required" } });
    payments.reset();
    await expect(svc.requestWithdrawal(req)).rejects.toMatchObject({ response: { reason: "kyc_required" } });
  });

  it("reads the durable account when memory is cold", async () => {
    payments.reset();
    payments.putPayment(payment("pA", "iA", "12.00", "0.43"));
    payments.putPayment(payment("pB", "iB", "8.50", "0.37"));
    await accounts.put(account());
    psp.balance = "25.00";
    expect(await svc.requestWithdrawal(req)).toMatchObject({ status: "in_transit", amount: "19.70" });
  });

  it("A2: 409 with the gate reason when a producer invoice is unpaid or no statement exists", async () => {
    psp.balance = "25.00";
    statements.put({
      participantId: "P",
      period: "2026-10",
      currency: "EUR",
      invoices: [{ invoiceId: "iA", producerId: "P", consumerId: "A", total: "12.00", status: "Open" }],
    });
    await expect(svc.requestWithdrawal(req)).rejects.toMatchObject({
      status: 409,
      response: { reason: "producer_invoices_unpaid" },
    });
    await expect(svc.requestWithdrawal({ ...req, period: "2026-09" })).rejects.toMatchObject({
      response: { reason: "statement_not_found" },
    });
  });

  it("INT-230: resolves an IdP sub to the registry participant", async () => {
    vi.mocked(resolver.resolveByIdpSub).mockResolvedValue({ participantId: "P", communityId: COM });
    psp.balance = "25.00";
    const p = await svc.requestWithdrawal({ ...req, participantId: "idp-sub-of-P", communityId: "other" });
    expect(p).toMatchObject({ participantId: "P", communityId: COM });
    expect(psp.createPayout).toHaveBeenCalledWith("acct_P", "19.70", "EUR", "payout:P:2026-10:1");
  });

  it("REQ-060: lists own payouts and the periods still withdrawable", async () => {
    psp.balance = "25.00";
    const paid = await svc.requestWithdrawal(req);
    payouts.put({ ...paid, payoutId: "other", participantId: "Q" });
    const view = await svc.listForParticipant("P");
    expect(view.items.map((p) => p.payoutId)).toEqual([paid.payoutId]);
    expect(view.withdrawable).toEqual([{ period: "2026-11", amount: "4.80", currency: "EUR" }]);
  });

  it("REQ-060: a failed period is withdrawable again", async () => {
    psp.balance = "25.00";
    const first = await svc.requestWithdrawal(req);
    payouts.put({ ...first, status: "failed" });
    const view = await svc.listForParticipant("P");
    expect(view.withdrawable.map((w) => w.period)).toEqual(["2026-10", "2026-11"]);
  });

  describe("payout webhooks (REQ-015, UAT-015)", () => {
    let id: string;
    const statuses = async () => (await events()).map((e) => (e.data as { status: string }).status);
    const pspEvent = (kind: PspEvent["kind"], over: Partial<PspEvent> = {}): PspEvent => ({
      eventId: `evt_${kind}`,
      occurredAt: "2026-11-26T08:00:00.000Z",
      kind,
      pspAccountRef: "acct_P",
      pspPayoutRef: "po_1",
      ...over,
    });

    beforeEach(async () => {
      psp.balance = "25.00";
      id = (await svc.requestWithdrawal(req)).payoutId;
    });

    it("UAT-015: payout.paid marks the payout paid and emits once; a repeated status is ignored", async () => {
      await svc.applyPayoutWebhook({ payoutRef: "po_1", status: "paid", accountRef: "acct_P", arrivalDate: "2026-11-26" });
      await svc.applyPayoutWebhook({ payoutRef: "po_1", status: "paid", accountRef: "acct_P" });
      expect(payouts.get(id)).toMatchObject({ status: "paid", arrivalDate: "2026-11-26" });
      expect(await statuses()).toEqual(["in_transit", "paid"]);
      expect((await events()).at(-1)).toMatchObject({
        type: "PayoutStatusChanged",
        data: { payoutId: id, participantId: "P", period: "2026-10", amount: "19.70", status: "paid" },
      });
    });

    it("payout.failed after paid (bank return) moves to failed with failureCategory", async () => {
      await svc.onPayoutEvent(pspEvent("payout.paid"));
      await svc.onPayoutEvent(pspEvent("payout.failed", { failureCategory: "bank_account_invalid" }));
      const row = payouts.get(id)!;
      expect(row.status).toBe("failed");
      expect(row.failureCategory).toBe("bank_account_invalid");
      expect(await statuses()).toEqual(["in_transit", "paid", "failed"]);
      expect((await events()).at(-1)).toMatchObject({ data: { status: "failed", failureCategory: "bank_account_invalid" } });
      const view = await svc.listForParticipant("P");
      expect(view.withdrawable.map((w) => w.period)).toContain("2026-10");
    });

    it("a payout event from another account is rejected", async () => {
      const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      await svc.onPayoutEvent(pspEvent("payout.paid", { pspAccountRef: "acct_X" }));
      await svc.onPayoutEvent(pspEvent("payout.paid", { pspAccountRef: undefined }));
      expect(payouts.get(id)!.status).toBe("in_transit");
      expect(await statuses()).toEqual(["in_transit"]);
      expect(warn).toHaveBeenCalledWith(`payout.webhook_account_mismatch payoutId=${id}`);
      warn.mockRestore();
    });

    it.each([
      ["canceled", "paid"],
      ["failed", "paid"],
      ["canceled", "failed"],
      ["failed", "canceled"],
      ["paid", "canceled"],
    ] as const)("terminal %s is never left for %s", async (terminal, next) => {
      payouts.put({ ...payouts.get(id)!, status: terminal });
      await svc.applyPayoutWebhook({ payoutRef: "po_1", status: next, accountRef: "acct_P" });
      expect(payouts.get(id)!.status).toBe(terminal);
      expect(await statuses()).toEqual(["in_transit"]);
    });

    it("payout.canceled ends an in-transit payout; the period is withdrawable again", async () => {
      await svc.onPayoutEvent(pspEvent("payout.canceled"));
      expect(payouts.get(id)!.status).toBe("canceled");
      expect(await statuses()).toEqual(["in_transit", "canceled"]);
      expect((await svc.listForParticipant("P")).withdrawable.map((w) => w.period)).toContain("2026-10");
    });

    it("payout.failed without a category records 'other'", async () => {
      await svc.onPayoutEvent(pspEvent("payout.failed"));
      expect(payouts.get(id)).toMatchObject({ status: "failed", failureCategory: "other" });
    });

    it("ignores unknown payout refs, events without a payout ref, and other kinds", async () => {
      await svc.onPayoutEvent(pspEvent("payout.paid", { pspPayoutRef: "po_unknown" }));
      await svc.onPayoutEvent(pspEvent("payout.paid", { pspPayoutRef: undefined }));
      await svc.onPayoutEvent(pspEvent("payment.succeeded"));
      expect(payouts.get(id)!.status).toBe("in_transit");
      expect(await statuses()).toEqual(["in_transit"]);
    });

    it("reads the durable account when memory is cold", async () => {
      payments.reset();
      await accounts.put(account());
      await svc.onPayoutEvent(pspEvent("payout.paid", { arrivalDate: "2026-11-27" }));
      expect(payouts.get(id)).toMatchObject({ status: "paid", arrivalDate: "2026-11-27" });
    });
  });

  describe("automatic payouts (REQ-015, A2)", () => {
    const run = () => svc.runAutoPayouts({ communityId: COM });

    beforeEach(() => {
      statements.reset();
      statements.put({
        participantId: "P",
        period: "2026-10",
        currency: "EUR",
        invoices: [
          { invoiceId: "iA", producerId: "P", consumerId: "A", total: "12.00", status: "Paid" },
          { invoiceId: "iB", producerId: "P", consumerId: "B", total: "8.50", status: "Paid" },
          { invoiceId: "iC", producerId: "C", consumerId: "P", total: "6.25", status: "Open" },
        ],
      });
      payments.putAccount(account({ participantId: "Q", pspAccountRef: "acct_Q" }));
      statements.put({
        participantId: "Q",
        period: "2026-10",
        currency: "EUR",
        invoices: [{ invoiceId: "iQ", producerId: "Q", consumerId: "A", total: "9.00", status: "Open" }],
      });
      psp.balance = "25.00";
    });

    it("REQ-015: autoPayout=false → nothing requested", async () => {
      settings.put(COM, { autoPayout: false });
      expect(await run()).toEqual({ requested: 0, blocked: 0, nearHoldingLimit: [] });
      expect(psp.createPayout).not.toHaveBeenCalled();
    });

    it("REQ-015: autoPayout=true pays eligible periods and counts blocked ones", async () => {
      settings.put(COM, { autoPayout: true });
      expect(await run()).toEqual({ requested: 1, blocked: 1, nearHoldingLimit: [] });
      const [p] = payouts.listForParticipant("P");
      expect(p).toMatchObject({ trigger: "auto", period: "2026-10", amount: "19.70", status: "in_transit" });
      expect(psp.createPayout).toHaveBeenCalledWith("acct_P", "19.70", "EUR", "payout:P:2026-10:1");
      expect(payouts.listForParticipant("Q")).toEqual([]);
    });

    it("a second run skips periods with a live payout", async () => {
      settings.put(COM, { autoPayout: true });
      await run();
      expect(await run()).toEqual({ requested: 0, blocked: 1, nearHoldingLimit: [] });
      expect(psp.createPayout).toHaveBeenCalledTimes(1);
    });

    it("skips unverified accounts, other communities and statements without sales", async () => {
      settings.put(COM, { autoPayout: true });
      payments.putAccount(account({ participantId: "Q", pspAccountRef: "acct_Q", kycStatus: "pending" }));
      payments.putAccount(account({ participantId: "X", pspAccountRef: "acct_X", communityId: "other" }));
      statements.put({
        participantId: "X",
        period: "2026-10",
        currency: "EUR",
        invoices: [{ invoiceId: "iX", producerId: "X", consumerId: "A", total: "3.00", status: "Paid" }],
      });
      statements.put({
        participantId: "P",
        period: "2026-11",
        currency: "EUR",
        invoices: [
          { invoiceId: "iE", producerId: "C", consumerId: "P", total: "4.00", status: "Paid" },
          { invoiceId: "iV", producerId: "P", consumerId: "A", total: "2.00", status: "Void" },
        ],
      });
      expect(await run()).toEqual({ requested: 1, blocked: 0, nearHoldingLimit: [] });
      expect(payouts.listForParticipant("X")).toEqual([]);
    });

    it("a PSP refusal counts as blocked; the period is retried by the next run", async () => {
      settings.put(COM, { autoPayout: true });
      psp.next = new PspError("insufficient_balance", "race");
      expect(await run()).toEqual({ requested: 0, blocked: 2, nearHoldingLimit: [] });
      expect(await run()).toEqual({ requested: 1, blocked: 1, nearHoldingLimit: [] });
      expect(payouts.listForPeriod("P", "2026-10").map((p) => p.attempt)).toEqual([1, 2]);
    });

    it("reads the community's accounts from the durable store when memory is cold", async () => {
      settings.put(COM, { autoPayout: true });
      payments.reset();
      payments.putPayment(payment("pA", "iA", "12.00", "0.43"));
      payments.putPayment(payment("pB", "iB", "8.50", "0.37"));
      await accounts.put(account());
      await accounts.put(account({ participantId: "Y", pspAccountRef: "acct_Y", communityId: "other" }));
      expect(await run()).toEqual({ requested: 1, blocked: 0, nearHoldingLimit: [] });
    });

    it("flags funds approaching Stripe's 90-day manual-payout limit", async () => {
      settings.put(COM, { autoPayout: true });
      const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      // P's 80-day-old payment is paid out by this run; Q's 76-day-old one is held by the A2 gate.
      payments.putPayment({ ...payment("pA", "iA", "12.00", "0.43"), settledAt: "2026-09-05T09:00:00.000Z" });
      payments.putPayment({ ...payment("pQ", "iQ-old", "3.00", "0.10"), payeeId: "Q", settledAt: "2026-09-09T09:00:00.000Z" });
      payments.putPayment({ ...payment("pQ2", "iQ-new", "3.00", "0.10"), payeeId: "Q", initiatedAt: "2026-09-11T09:00:00.000Z" });
      const r = await run();
      expect(r.nearHoldingLimit).toEqual(["Q"]);
      expect(warn).toHaveBeenCalledWith(`payout.near_holding_limit communityId=${COM} participantIds=Q`);
      warn.mockRestore();
    });

    it("does not flag funds younger than 75 days or without a settlement date", async () => {
      settings.put(COM, { autoPayout: true });
      payments.putPayment({ ...payment("pQ", "iQ", "3.00", "0.10"), payeeId: "Q", initiatedAt: "2026-09-11T09:00:00.000Z" });
      payments.putPayment({ ...payment("pQ3", "iQ3", "3.00", "0.10"), payeeId: "Q" });
      payments.putPayment({
        ...payment("pQ4", "iQ4", "3.00", "0.10"),
        payeeId: "Q",
        status: "failed",
        settledAt: "2026-08-01T09:00:00.000Z",
      });
      expect((await run()).nearHoldingLimit).toEqual([]);
    });

    it("propagates unexpected errors so the scheduler records the job as failed", async () => {
      settings.put(COM, { autoPayout: true });
      psp.next = new Error("socket hang up");
      await expect(run()).rejects.toThrow(/socket hang up/);
    });
  });
});
