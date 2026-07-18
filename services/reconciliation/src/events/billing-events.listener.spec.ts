import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { BillingEventsListener } from "./billing-events.listener.js";

describe("BillingEventsListener reconciliation (INT-271)", () => {
  let bus: InMemoryEventBus;
  let projectInvoice: ReturnType<typeof vi.fn>;
  let projectPayment: ReturnType<typeof vi.fn>;
  let reconcile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    projectInvoice = vi.fn();
    projectPayment = vi.fn();
    reconcile = vi.fn().mockResolvedValue({ accepted: true });
    const listener = new BillingEventsListener(bus, {
      projectInvoice,
      projectPayment,
      reconcile,
    } as never);
    await listener.onModuleInit();
  });

  it("projects invoice and payment events", async () => {
    await bus.publish("InvoiceIssued", {
      communityId: "c1",
      data: { invoiceId: "inv-1", amounts: { total: "1.00" }, currency: "EUR" },
    });
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: "pay-1",
        invoiceId: "inv-1",
        amount: "1.00",
        currency: "EUR",
        status: "succeeded",
      },
    });
    expect(projectInvoice).toHaveBeenCalled();
    expect(projectPayment).toHaveBeenCalled();
  });

  it("reconciles on BillingRunCompleted", async () => {
    await bus.publish("BillingRunCompleted", {
      communityId: "c1",
      data: { period: "2026-10" },
    });
    expect(reconcile).toHaveBeenCalledWith({
      scope: "invoice",
      communityId: "c1",
    });
  });
});
