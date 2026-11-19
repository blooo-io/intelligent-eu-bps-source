import { describe, expect, it } from "vitest";
import { mapErasureRequestedEnvelope, unwrapEnvelope } from "./erasure-envelope.js";

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

  it("unwraps string JSON and CloudEvents schema payload", () => {
    expect(
      mapErasureRequestedEnvelope(
        JSON.stringify({
          eventId: "evt-str",
          data: { requestId: "req-str", participantId: "part-str" },
        }),
      ).participantId,
    ).toBe("part-str");
    expect(
      mapErasureRequestedEnvelope({
        schema: "ce",
        payload: { eventId: "evt-ce", data: { requestId: "req-ce2", participantId: "p" } },
      }).requestId,
    ).toBe("req-ce2");
  });

  it("maps legacy id envelope and tolerates invalid JSON", () => {
    expect(unwrapEnvelope("not-json")).toEqual({});
    expect(
      mapErasureRequestedEnvelope({
        id: "legacy-1",
        data: { participantId: "part-legacy" },
      }),
    ).toMatchObject({
      eventId: "legacy-1",
      participantId: "part-legacy",
    });
    expect(
      mapErasureRequestedEnvelope({
        id: "legacy-1",
        data: { participantId: "part-legacy" },
      }).requestId,
    ).toBe("");
    expect(
      mapErasureRequestedEnvelope({
        after: { event: { eventId: "evt-obj", data: { requestId: "r" } } },
      }).eventId,
    ).toBe("evt-obj");
  });

  it("reads top-level erasure fields when data is absent", () => {
    expect(
      mapErasureRequestedEnvelope({
        eventId: "evt-top",
        requestId: "req-top",
        participantId: "part-top",
      }),
    ).toEqual({
      eventId: "evt-top",
      requestId: "req-top",
      participantId: "part-top",
    });
  });
});
