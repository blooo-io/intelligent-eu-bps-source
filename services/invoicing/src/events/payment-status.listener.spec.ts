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
    listener = new PaymentStatusListener(
      bus,
      invoicing as never,
      consumer,
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

  it("ignores non-succeeded PaymentStatusChanged", async () => {
    await bus.publish("PaymentStatusChanged", {
      eventId: "evt-fail",
      data: {
        paymentId: "pay-fail",
        invoiceId: "inv-1",
        status: "failed",
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

  // INT-460 — live NATS payload is CloudEvents-wrapped (Debezium EventRouter).
  it("marks Paid when PaymentStatusChanged arrives as CloudEvents envelope", async () => {
    await bus.publish("PaymentStatusChanged", {
      id: "ce-outer-1",
      source: "outbox",
      type: "PaymentStatusChanged",
      data: {
        eventId: "evt-pay-ce-1",
        type: "PaymentStatusChanged",
        data: {
          paymentId: "pay-ce-1",
          invoiceId: "inv-ce-1",
          status: "succeeded",
        },
      },
    });
    expect(apply).toHaveBeenCalledWith({
      invoiceId: "inv-ce-1",
      paymentId: "pay-ce-1",
      status: "succeeded",
    });
  });

  it("marks Paid when payload is JSON Converter { schema, payload }", async () => {
    await bus.publish("PaymentStatusChanged", {
      schema: { type: "struct" },
      payload: {
        eventId: "evt-pay-schema-1",
        data: {
          paymentId: "pay-schema-1",
          invoiceId: "inv-schema-1",
          status: "succeeded",
        },
      },
    });
    expect(apply).toHaveBeenCalledWith({
      invoiceId: "inv-schema-1",
      paymentId: "pay-schema-1",
      status: "succeeded",
    });
  });
});
