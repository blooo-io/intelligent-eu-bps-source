import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { BillingEventsListener } from "./billing-events.listener.js";

describe("BillingEventsListener publication (INT-271)", () => {
  let bus: InMemoryEventBus;
  let onInvoiceIssued: ReturnType<typeof vi.fn>;
  let onInvoiceStatusChanged: ReturnType<typeof vi.fn>;
  let onPaymentStatusChanged: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    onInvoiceIssued = vi.fn().mockResolvedValue(undefined);
    onInvoiceStatusChanged = vi.fn().mockResolvedValue(undefined);
    onPaymentStatusChanged = vi.fn().mockResolvedValue(undefined);
    const listener = new BillingEventsListener(bus, {
      onInvoiceIssued,
      onInvoiceStatusChanged,
      onPaymentStatusChanged,
    } as never);
    await listener.onModuleInit();
  });

  it("publishes InvoiceIssued via onInvoiceIssued", async () => {
    await bus.publish("InvoiceIssued", {
      communityId: "c1",
      billingMode: "virtual",
      data: {
        invoiceId: "inv-1",
        issuerId: "p1",
        recipientId: "c1-user",
        amounts: { total: "2.00", energy: "1.80", vat: "0.20" },
        currency: "EUR",
        tradeIds: ["t1"],
      },
    });
    expect(onInvoiceIssued).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "inv-1",
        communityId: "c1",
        totalAmount: 2,
        selfBilling: true,
      }),
    );
  });

  it("maps live mode and producer/consumer fallbacks", async () => {
    await bus.publish("InvoiceIssued", {
      communityId: "c1",
      billingMode: "live",
      data: {
        invoiceId: "inv-2",
        producerId: "prod",
        consumerId: "cons",
        periodFrom: "2026-11-01",
        periodUntil: "2026-11-28",
        dueDate: "2026-12-15",
        status: "Open",
      },
    });
    expect(onInvoiceIssued).toHaveBeenCalledWith(
      expect.objectContaining({
        billingMode: "live",
        invoiceIssuedBy: "prod",
        invoiceIssuedTo: "cons",
        billingPeriodFrom: "2026-11-01",
        invoiceDueDate: "2026-12-15",
        tradeIds: [],
      }),
    );
  });

  it("skips InvoiceIssued without invoiceId", async () => {
    await bus.publish("InvoiceIssued", { communityId: "c1", data: {} });
    expect(onInvoiceIssued).not.toHaveBeenCalled();
  });

  it("forwards InvoiceStatusChanged with outstanding", async () => {
    await bus.publish("InvoiceStatusChanged", {
      data: { invoiceId: "inv-1", status: "Paid", outstanding: 0 },
    });
    expect(onInvoiceStatusChanged).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      status: "Paid",
      outstanding: 0,
    });
  });

  it("swallows InvoiceStatusChanged errors until Issued lands", async () => {
    onInvoiceStatusChanged.mockRejectedValueOnce(new Error("unknown invoice"));
    await bus.publish("InvoiceStatusChanged", {
      data: { invoiceId: "inv-missing", status: "Paid" },
    });
    expect(onInvoiceStatusChanged).toHaveBeenCalled();
  });

  it("skips InvoiceStatusChanged without invoiceId", async () => {
    await bus.publish("InvoiceStatusChanged", { data: { status: "Paid" } });
    expect(onInvoiceStatusChanged).not.toHaveBeenCalled();
  });

  it("publishes PaymentStatusChanged with failureCategory", async () => {
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: "pay-1",
        invoiceId: "inv-1",
        status: "failed",
        amount: "2.00",
        participantId: "c1-user",
        method: "sepa_debit",
        failureCategory: "card_declined",
      },
    });
    expect(onPaymentStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "pay-1",
        paymentStatus: "failed",
        paymentMethod: "sepa_debit",
        failureCategory: "card_declined",
      }),
    );
  });

  it("skips PaymentStatusChanged when ids missing", async () => {
    await bus.publish("PaymentStatusChanged", {
      data: { paymentId: "pay-only" },
    });
    expect(onPaymentStatusChanged).not.toHaveBeenCalled();
  });
});
