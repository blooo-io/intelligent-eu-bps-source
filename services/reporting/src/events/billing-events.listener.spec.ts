import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { BillingEventsListener } from "./billing-events.listener.js";

describe("BillingEventsListener reporting (INT-271)", () => {
  let bus: InMemoryEventBus;
  let projectInvoice: ReturnType<typeof vi.fn>;
  let projectPayment: ReturnType<typeof vi.fn>;
  let buildReport: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    projectInvoice = vi.fn();
    projectPayment = vi.fn();
    buildReport = vi.fn().mockResolvedValue({ accepted: true });
    const listener = new BillingEventsListener(bus, {
      projectInvoice,
      projectPayment,
      buildReport,
    } as never);
    await listener.onModuleInit();
  });

  it("projects InvoiceIssued", async () => {
    await bus.publish("InvoiceIssued", {
      communityId: "c1",
      data: {
        invoiceId: "inv-1",
        issuerId: "p1",
        recipientId: "c-user",
        currency: "EUR",
        amounts: { total: "2.00" },
        tradeIds: ["t1"],
      },
    });
    expect(projectInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "inv-1",
        communityId: "c1",
        total: "2.00",
      }),
    );
  });

  it("projects PaymentStatusChanged", async () => {
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: "pay-1",
        invoiceId: "inv-1",
        status: "succeeded",
        amount: "2.00",
        currency: "EUR",
      },
    });
    expect(projectPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay-1", status: "succeeded" }),
    );
  });

  it("builds report on BillingRunCompleted", async () => {
    await bus.publish("BillingRunCompleted", {
      communityId: "c1",
      data: { period: "2026-10" },
    });
    expect(buildReport).toHaveBeenCalledWith({
      communityId: "c1",
      period: "2026-10",
    });
  });
});
