import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import {
  ParticipantOffboardedListener,
  periodFromEffectiveAt,
} from "./participant-offboarded.listener.js";
import type { SettlementService } from "../settlement/settlement.service.js";

describe("ParticipantOffboardedListener (INT-273)", () => {
  let bus: InMemoryEventBus;
  let startRun: ReturnType<typeof vi.fn>;
  let listener: ParticipantOffboardedListener;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    startRun = vi.fn(async () => ({ runId: "run-final-1" }));
    listener = new ParticipantOffboardedListener(bus, {
      startRun,
    } as unknown as SettlementService);
    await listener.onModuleInit();
  });

  it("REQ-012: offboard starts final run for the leaving participant (BR-05)", async () => {
    await bus.publish("ParticipantOffboarded", {
      eventId: "evt-off-1",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      data: {
        participantId: "p1111111-1111-4111-8111-111111111111",
        effectiveAt: "2026-11-15T12:00:00Z",
      },
    });
    expect(startRun).toHaveBeenCalledWith({
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      type: "final",
      period: "2026-11",
      onlyParticipantId: "p1111111-1111-4111-8111-111111111111",
    });
  });

  it("unwraps Debezium after.event envelope", async () => {
    await bus.publish("ParticipantOffboarded", {
      after: {
        event: JSON.stringify({
          communityId: "c1",
          data: {
            participantId: "p1",
            effectiveAt: "2026-12-01T00:00:00Z",
          },
        }),
      },
    });
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: "c1",
        type: "final",
        period: "2026-12",
        onlyParticipantId: "p1",
      }),
    );
  });

  it("skips when participantId missing", async () => {
    await bus.publish("ParticipantOffboarded", {
      communityId: "c1",
      data: {},
    });
    expect(startRun).not.toHaveBeenCalled();
  });

  it("periodFromEffectiveAt parses UTC month", () => {
    expect(periodFromEffectiveAt("2026-12-31T23:00:00Z")).toBe("2026-12");
    expect(periodFromEffectiveAt("")).toMatch(/^\d{4}-\d{2}$/);
  });
});
