/**
 * REQ-015 / REQ-060 / UAT-015 — participant withdrawal and payout records (INT-426).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryOutboxStore, OutboxService } from "@intelligent/module-template";
import type { Clock } from "../domain/clock.js";
import { PayoutsStore } from "../domain/payouts.store.js";
import { PaymentsStore, type AccountRecord, type PaymentRecord } from "../domain/store.js";
import { InMemoryPaymentAccountsStore } from "../ports/payment-accounts.store.js";
import type { ParticipantsResolverPort } from "../ports/participants-resolver.port.js";
import { InMemoryStatementLookup } from "../ports/statement-lookup.port.js";
import type { PayoutPort, PayoutResult } from "../psp/payout.port.js";
import { PspError } from "../psp/psp.types.js";
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
    svc = new PayoutsService(
      payouts,
      payments,
      new OutboxService(outboxStore),
      psp,
      statements,
      resolver,
      accounts,
      new FixedClock(),
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
});
