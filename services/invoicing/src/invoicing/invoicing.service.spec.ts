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
  rate: "1.00",
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
});
