import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { PaymentStatusListener } from "./payment-status.listener.js";

describe("PaymentStatusListener (INT-270)", () => {
  let bus: InMemoryEventBus;
  let apply: ReturnType<typeof vi.fn>;
  let listener: PaymentStatusListener;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    apply = vi.fn().mockResolvedValue({ invoiceId: "inv-1", status: "Paid" });
    const invoicing = {
      applyPaymentStatusChanged: apply,
    };
    const consumer = new IdempotentConsumer(new InMemoryProcessedEventsStore());
    const payments = {
      getPayment: vi.fn(async (paymentId: string) => ({
        paymentId,
        invoiceId: paymentId === "pay-1" ? "inv-1" : "inv-2",
        status: "succeeded",
      })),
    };
    listener = new PaymentStatusListener(
      bus,
      invoicing as never,
      consumer,
      payments as never,
    );
    await listener.onModuleInit();
  });

  it("marks invoice Paid on succeeded PaymentStatusChanged", async () => {
    await bus.publish("PaymentStatusChanged", {
      eventId: "evt-pay-1",
      data: {
        paymentId: "pay-1",
        invoiceId: "inv-1",
        status: "succeeded",
      },
    });
    expect(apply).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      paymentId: "pay-1",
      status: "succeeded",
    });
  });

  it("is idempotent on redelivery", async () => {
    const envelope = {
      eventId: "evt-pay-2",
      data: {
        paymentId: "pay-2",
        invoiceId: "inv-2",
        status: "succeeded",
      },
    };
    await bus.publish("PaymentStatusChanged", envelope);
    await bus.publish("PaymentStatusChanged", envelope);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("INT-338 — ignores a succeeded body AC-07 does not confirm", async () => {
    const payments = {
      getPayment: vi.fn(async () => ({
        paymentId: "pay-forged",
        invoiceId: "inv-other",
        status: "failed",
      })),
    };
    const local = new PaymentStatusListener(
      bus,
      { applyPaymentStatusChanged: apply } as never,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      payments as never,
    );
    await local.onModuleInit();
    await bus.publish("PaymentStatusChanged", {
      eventId: "evt-forged",
      data: {
        paymentId: "pay-forged",
        invoiceId: "inv-1",
        status: "succeeded",
      },
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("skips envelopes without invoiceId", async () => {
    await bus.publish("PaymentStatusChanged", {
      eventId: "evt-pay-3",
      data: { paymentId: "pay-3", status: "succeeded" },
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
