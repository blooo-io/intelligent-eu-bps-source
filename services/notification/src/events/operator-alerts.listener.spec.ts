import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { OperatorAlertsListener } from "./operator-alerts.listener.js";

describe("OperatorAlertsListener (INT-274)", () => {
  let bus: InMemoryEventBus;
  let send: ReturnType<typeof vi.fn>;
  const prev = process.env.OPERATOR_ALERT_TO;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    send = vi.fn().mockResolvedValue(undefined);
    process.env.OPERATOR_ALERT_TO = "ops@example.com";
    const listener = new OperatorAlertsListener(bus, { send } as never);
    await listener.onModuleInit();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.OPERATOR_ALERT_TO;
    else process.env.OPERATOR_ALERT_TO = prev;
  });

  it("mails JobFailed / DiscrepancyDetected / IntakeAnomalyDetected", async () => {
    await bus.publish("JobFailed", {
      eventId: "e1",
      communityId: "c1",
      data: { jobId: "j1", error: "timeout" },
    });
    await bus.publish("DiscrepancyDetected", {
      data: { scope: "invoice", expected: "1", actual: "0" },
    });
    await bus.publish("IntakeAnomalyDetected", {
      data: { type: "unknown_party", marketId: "m1" },
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]![0]).toMatchObject({
      to: "ops@example.com",
      template: "operator-alert",
    });
  });

  it("fail-soft when OPERATOR_ALERT_TO unset", async () => {
    delete process.env.OPERATOR_ALERT_TO;
    bus = new InMemoryEventBus();
    send = vi.fn();
    const listener = new OperatorAlertsListener(bus, { send } as never);
    await listener.onModuleInit();
    await bus.publish("JobFailed", { data: { jobId: "j1", error: "x" } });
    expect(send).not.toHaveBeenCalled();
  });
});
