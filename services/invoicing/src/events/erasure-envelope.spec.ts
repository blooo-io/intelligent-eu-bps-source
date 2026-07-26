import { describe, expect, it } from "vitest";
import { mapErasureRequestedEnvelope } from "./erasure-envelope.js";

describe("mapErasureRequestedEnvelope (INT-275)", () => {
  it("reads AsyncAPI envelope", () => {
    expect(
      mapErasureRequestedEnvelope({
        eventId: "evt-1",
        data: { requestId: "req-1", participantId: "part-1" },
      }),
    ).toEqual({
      eventId: "evt-1",
      requestId: "req-1",
      participantId: "part-1",
    });
  });

  it("unwraps CloudEvents id + data", () => {
    expect(
      mapErasureRequestedEnvelope({
        id: "ce-1",
        data: { requestId: "req-ce", participantId: "part-ce" },
      }).requestId,
    ).toBe("req-ce");
  });

  it("unwraps Debezium after.event JSON", () => {
    const payload = {
      after: {
        event: JSON.stringify({
          eventId: "evt-2",
          data: { requestId: "req-2", participantId: "part-2" },
        }),
      },
    };
    expect(mapErasureRequestedEnvelope(payload).requestId).toBe("req-2");
  });
});
