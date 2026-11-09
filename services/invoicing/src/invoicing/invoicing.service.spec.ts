/**
 * INT-106 / INT-128 — TD-2 mapping, BR-09, BR-10.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { InvoiceStore } from "../domain/store.js";
import type { PairSettlementInput } from "../domain/types.js";
import {
  NoopPaymentsClient,
  type PaymentsClientPort,
} from "../ports/payments-client.port.js";
import type { ParticipantsResolverPort } from "../ports/participants-resolver.port.js";
import { NoopParticipantsResolver } from "../ports/participants-resolver.port.js";
import { MapReadiness } from "../ports/readiness.port.js";
import { MockStripeInvoiceAdapter } from "../stripe/mock-stripe-invoice.js";
import { InvoicingService } from "./invoicing.service.js";

const settlement = (
  over: Partial<PairSettlementInput> = {},
): PairSettlementInput => ({
  settlementId: "s1111111-1111-4111-8111-111111111111",
  runId: "r1111111-1111-4111-8111-111111111111",
  consumerId: "11111111-2222-4333-8444-555555555555",
  producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
  tradeIds: ["0xabc"],
  kWh: "10.00",
  energyAmount: "2.00",
  vat: "0.00",
  currency: "EUR",
  rate: "1.0000",
  communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
  ...over,
});

describe("InvoicingService", () => {
  let store: InvoiceStore;
  let outboxStore: InMemoryOutboxStore;
  let stripe: MockStripeInvoiceAdapter;
  let service: InvoicingService;

  beforeEach(() => {
    store = new InvoiceStore();
    outboxStore = new InMemoryOutboxStore();
    stripe = new MockStripeInvoiceAdapter();
    service = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      stripe,
      new MapReadiness(
        new Map([["66666666-7777-4888-9999-aaaaaaaaaaaa", true]]),
      ),
      new NoopPaymentsClient(),
      new NoopParticipantsResolver(),
    );
    service.registerConnectAccount(
      "66666666-7777-4888-9999-aaaaaaaaaaaa",
      "acct_producer_a",
    );
  });

  it("maps a pair settlement to a Stripe invoice (TD-2, BR-10)", async () => {
    const invoice = await service.createFromSettlement(settlement());
    expect(invoice).not.toBeNull();
    expect(invoice!.stripeInvoiceId).toMatch(/^in_test_/);
    expect(invoice!.legalNumber).toMatch(/^ACCT_PRO-000001$/);
    expect(invoice!.status).toBe("Open");
    expect(invoice!.total).toBe("2.00");
    expect(stripe.created).toHaveLength(1);

    const again = await service.createFromSettlement(settlement());
    expect(again!.invoiceId).toBe(invoice!.invoiceId);
    expect(stripe.created).toHaveLength(1);

    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("InvoiceIssued");
  });

  it("holds invoicing until producer is ready (BR-09)", async () => {
    service = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      stripe,
      new MapReadiness(new Map()),
      new NoopPaymentsClient(),
      new NoopParticipantsResolver(),
    );
    await expect(service.createFromSettlement(settlement())).rejects.toThrow(
      /not[_ ]ready/,
    );
    expect(stripe.created).toHaveLength(0);
  });

  it("skips zero-amount carry-forward settlements", async () => {
    const result = await service.createFromSettlement(
      settlement({ energyAmount: "0.00" }),
    );
    expect(result).toBeNull();
  });

  it("uses producerStripeAccountId override when provided (INT-197 / UAT-028)", async () => {
    const invoice = await service.createFromSettlement(
      settlement({ producerStripeAccountId: "acct_override_live" }),
    );
    expect(invoice!.producerStripeAccountId).toBe("acct_override_live");
    // Mock legal number is derived from the Connect account id (BR-10).
    expect(invoice!.legalNumber).toMatch(/^ACCT_OVE-000001$/);
  });

  it("refuses synthetic acct_test_* when Stripe invoice provider is live (INT-228)", async () => {
    const prev = process.env.STRIPE_INVOICE_PROVIDER;
    process.env.STRIPE_INVOICE_PROVIDER = "stripe";
    const live = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      stripe,
      new MapReadiness(
        new Map([["66666666-7777-4888-9999-aaaaaaaaaaaa", true]]),
      ),
      new NoopPaymentsClient(),
      new NoopParticipantsResolver(),
    );
    try {
      await expect(live.createFromSettlement(settlement())).rejects.toThrow(
        /Connect account required/,
      );
    } finally {
      if (prev === undefined) delete process.env.STRIPE_INVOICE_PROVIDER;
      else process.env.STRIPE_INVOICE_PROVIDER = prev;
    }
  });

  it("INT-231 — holds invoice when charges_enabled is false (retryable)", async () => {
    const payments: PaymentsClientPort = {
      getProducerStripeAccountId: async () => "acct_pending",
      getPaymentAccount: async () => ({
        stripeAccountId: "acct_pending",
        chargesEnabled: false,
      }),
      ensureConnectedCustomer: async () => "cus_unused",
    };
    const gated = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      stripe,
      new MapReadiness(
        new Map([["66666666-7777-4888-9999-aaaaaaaaaaaa", true]]),
      ),
      payments,
      new NoopParticipantsResolver(),
    );
    await expect(gated.createFromSettlement(settlement())).rejects.toThrow(
      /charges_enabled/,
    );
    expect(stripe.created).toHaveLength(0);
  });

  it("UAT-014 REQ-014 bills the consumer's AC-07 connected-account Customer and exposes the Stripe invoice id (INT-355)", async () => {
    const calls: Array<[string, string]> = [];
    const payments: PaymentsClientPort = {
      getProducerStripeAccountId: async () => "acct_live_p",
      getPaymentAccount: async () => ({ stripeAccountId: "acct_live_p", chargesEnabled: true }),
      ensureConnectedCustomer: async (consumerId, stripeAccountId) => {
        calls.push([consumerId, stripeAccountId]);
        return "cus_conn_1";
      },
    };
    const direct = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      stripe,
      new MapReadiness(new Map([["66666666-7777-4888-9999-aaaaaaaaaaaa", true]])),
      payments,
      new NoopParticipantsResolver(),
    );
    const invoice = (await direct.createFromSettlement(settlement()))!;
    expect(calls).toEqual([["11111111-2222-4333-8444-555555555555", "acct_live_p"]]);
    expect(stripe.requests).toEqual([
      { stripeAccountId: "acct_live_p", stripeCustomerId: "cus_conn_1" },
    ]);
    expect(direct.getInvoice(invoice.invoiceId)).toMatchObject({
      producerStripeAccountId: "acct_live_p",
      stripeInvoiceId: invoice.stripeInvoiceId,
    });
    expect(direct.getInvoiceBySettlement(invoice.settlementId).stripeInvoiceId).toBe(
      invoice.stripeInvoiceId,
    );
  });

  it("uses a synthetic Customer only with the mock invoice provider (INT-355)", async () => {
    await service.createFromSettlement(settlement());
    expect(stripe.requests[0]!.stripeCustomerId).toMatch(/^cus_test_/);

    const prev = process.env.STRIPE_INVOICE_PROVIDER;
    process.env.STRIPE_INVOICE_PROVIDER = "stripe";
    try {
      await expect(
        service.createFromSettlement(
          settlement({ settlementId: "s2222222-2222-4222-8222-222222222222" }),
        ),
      ).rejects.toThrow(/connected-account Customer required/);
    } finally {
      if (prev === undefined) delete process.env.STRIPE_INVOICE_PROVIDER;
      else process.env.STRIPE_INVOICE_PROVIDER = prev;
    }
  });

  it("marks open invoices overdue (REQ-044)", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    // Force due date in the past via store.
    store.put({ ...invoice, dueDate: "2020-01-01" });
    const result = await service.markOverdue("2026-11-01");
    expect(result.marked).toBe(1);
    expect(service.getInvoice(invoice.invoiceId).status).toBe("Overdue");
  });

  it("UAT-055 — manager sets Paid with reason and audit trail (REQ-044)", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const updated = await service.setInvoiceStatus(invoice.invoiceId, {
      status: "Paid",
      reason: "paid outside the platform",
      actorId: actor,
    });
    expect(updated.status).toBe("Paid");
    const audit = service.listStatusAudit(invoice.invoiceId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: actor,
      status: "Paid",
      reason: "paid outside the platform",
      source: "manual",
    });
    const events = await outboxStore.list();
    expect(events.some((e) => e.event.type === "InvoiceStatusChanged")).toBe(
      true,
    );
    expect(
      events.some((e) => e.event.type === "AuditableActionPerformed"),
    ).toBe(true);
    await expect(
      service.setInvoiceStatus(invoice.invoiceId, {
        status: "Paid",
        reason: "   ",
        actorId: actor,
      }),
    ).rejects.toThrow(/reason/);
  });

  it("applies Stripe webhook status into the cache (TD-6)", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const next = await service.applyStripeStatus({
      stripeInvoiceId: invoice.stripeInvoiceId,
      status: "Paid",
    });
    expect(next?.status).toBe("Paid");
    expect(service.listStatusAudit(invoice.invoiceId)[0]?.source).toBe("stripe");
  });

  it("INT-270 — PaymentStatusChanged succeeded marks invoice Paid", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    expect(invoice.status).toBe("Open");
    const next = await service.applyPaymentStatusChanged({
      invoiceId: invoice.invoiceId,
      paymentId: "pay-1",
      status: "succeeded",
    });
    expect(next?.status).toBe("Paid");
    const again = await service.applyPaymentStatusChanged({
      invoiceId: invoice.invoiceId,
      paymentId: "pay-1",
      status: "succeeded",
    });
    expect(again?.status).toBe("Paid");
    expect(
      service.listStatusAudit(invoice.invoiceId).filter((a) => a.status === "Paid"),
    ).toHaveLength(1);
  });

  it("INT-238 — getInvoiceBySettlement returns the row", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    expect(service.getInvoiceBySettlement(invoice.settlementId).invoiceId).toBe(
      invoice.invoiceId,
    );
  });

  it("INT-236 — listInvoices resolves IdP sub to participantId", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const idp: ParticipantsResolverPort = {
      resolveByIdpSub: async (sub) =>
        sub === "c1a55e01-0001-4000-8000-000000000001"
          ? {
              participantId: "11111111-2222-4333-8444-555555555555",
              communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
            }
          : null,
    };
    const withIdp = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      stripe,
      new MapReadiness(
        new Map([["66666666-7777-4888-9999-aaaaaaaaaaaa", true]]),
      ),
      new NoopPaymentsClient(),
      idp,
    );
    const listed = await withIdp.listInvoicesForParticipant(
      "c1a55e01-0001-4000-8000-000000000001",
    );
    expect(listed.some((r) => r.invoiceId === invoice.invoiceId)).toBe(true);
  });

  it("REQ-013 / INT-275 — erasure retains invoices and emits ErasureCompleted", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const beforeCount = store.listByParticipant(
      "11111111-2222-4333-8444-555555555555",
    ).length;
    expect(beforeCount).toBeGreaterThan(0);

    const result = await service.applyErasureRequested({
      requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      participantId: "11111111-2222-4333-8444-555555555555",
    });
    expect(result.invoicesRetained).toBe(beforeCount);
    expect(store.get(invoice.invoiceId)?.invoiceId).toBe(invoice.invoiceId);

    const events = await outboxStore.list();
    const completed = events.find((e) => e.event.type === "ErasureCompleted");
    expect(completed?.event.producer).toBe("AC-06");
    expect(completed?.event.data).toMatchObject({
      requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      module: "AC-06",
      result: "completed",
    });
  });
});
