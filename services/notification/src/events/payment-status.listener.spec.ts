import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { PaymentStatusListener } from "./payment-status.listener.js";

describe("PaymentStatusListener (INT-209)", () => {
  it("maps AsyncAPI envelope and forwards to NotificationService", async () => {
    const bus = new InMemoryEventBus();
    const onPaymentStatusChanged = vi.fn(async () => ({ accepted: true }));
    const notifications = { onPaymentStatusChanged } as never;
    const listener = new PaymentStatusListener(bus, notifications);
    await listener.onModuleInit();

    await bus.publish("PaymentStatusChanged", {
      eventId: "e1",
      communityId: "c1",
      data: {
        paymentId: "p1",
        invoiceId: "i1",
        status: "succeeded",
        participantId: "u1",
      },
    });

    expect(onPaymentStatusChanged).toHaveBeenCalledWith({
      eventId: "e1",
      communityId: "c1",
      paymentId: "p1",
      invoiceId: "i1",
      status: "succeeded",
      participantId: "u1",
      failureCategory: undefined,
    });
  });
});
