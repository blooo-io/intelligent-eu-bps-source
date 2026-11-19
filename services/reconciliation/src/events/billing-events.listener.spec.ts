import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { BillingEventsListener } from "./billing-events.listener.js";

describe("BillingEventsListener reconciliation (INT-271)", () => {
  let bus: InMemoryEventBus;
  let projectInvoice: ReturnType<typeof vi.fn>;
  let projectPayment: ReturnType<typeof vi.fn>;
  let reconcile: ReturnType<typeof vi.fn>;
  let listener: BillingEventsListener;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    projectInvoice = vi.fn();
    projectPayment = vi.fn();
    reconcile = vi.fn().mockResolvedValue({ accepted: true });
    listener = new BillingEventsListener(bus, {
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

  it("projects InvoiceStatusChanged like InvoiceIssued", async () => {
    await bus.publish("InvoiceStatusChanged", {
      communityId: "c1",
      data: { invoiceId: "inv-status", total: "2.50", currency: "CHF" },
    });
    expect(projectInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv-status", total: "2.50" }),
    );
  });

  it("skips invoice projection when invoiceId is missing", async () => {
    await listener.onInvoice({ communityId: "c1", data: {} });
    expect(projectInvoice).not.toHaveBeenCalled();
  });

  it("uses flat total when amounts are absent", async () => {
    await listener.onInvoice({
      communityId: "c1",
      data: { invoiceId: "inv-flat", total: "3.00" },
    });
    expect(projectInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv-flat", total: "3.00" }),
    );
  });

  it("skips payment projection when ids are missing", async () => {
    await listener.onPayment({ communityId: "c1", data: { paymentId: "pay-only" } });
    await listener.onPayment({ communityId: "c1", data: { invoiceId: "inv-only" } });
    expect(projectPayment).not.toHaveBeenCalled();
  });

  it("skips reconcile when BillingRunCompleted has no communityId", async () => {
    await listener.onBillingRun({ data: { period: "2026-10" } });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("dedupes handled events on eventId (INT-339)", async () => {
    const localBus = new InMemoryEventBus();
    const localProjectInvoice = vi.fn();
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    const dedupeListener = new BillingEventsListener(
      localBus,
      {
        projectInvoice: localProjectInvoice,
        projectPayment: vi.fn(),
        reconcile: vi.fn(),
      } as never,
      consumer,
    );
    await dedupeListener.onModuleInit();
    const payload = {
      eventId: "evt-dup",
      communityId: "c1",
      data: { invoiceId: "inv-dedupe", total: "1.00" },
    };
    await localBus.publish("InvoiceIssued", payload);
    await localBus.publish("InvoiceIssued", payload);
    expect(localProjectInvoice).toHaveBeenCalledTimes(1);
  });

  it("rethrows when deduped handler fails", async () => {
    const localBus = new InMemoryEventBus();
    const localReconcile = vi.fn().mockRejectedValue(new Error("reconcile failed"));
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    const dedupeListener = new BillingEventsListener(
      localBus,
      {
        projectInvoice: vi.fn(),
        projectPayment: vi.fn(),
        reconcile: localReconcile,
      } as never,
      consumer,
    );
    await dedupeListener.onModuleInit();
    await expect(
      localBus.publish("BillingRunCompleted", {
        eventId: "evt-fail",
        communityId: "c1",
        data: {},
      }),
    ).rejects.toThrow("reconcile failed");
  });
});
