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

  it("unwraps CloudEvents id + nested data", () => {
    expect(
      mapErasureRequestedEnvelope({
        id: "ce-1",
        data: { requestId: "req-ce", participantId: "part-ce" },
      }),
    ).toEqual({
      eventId: "ce-1",
      requestId: "req-ce",
      participantId: "part-ce",
    });
  });

  it("unwraps Debezium after.event JSON string", () => {
    const payload = {
      after: {
        event: JSON.stringify({
          eventId: "evt-2",
          data: { requestId: "req-2", participantId: "part-2" },
        }),
      },
    };
    expect(mapErasureRequestedEnvelope(payload)).toEqual({
      eventId: "evt-2",
      requestId: "req-2",
      participantId: "part-2",
    });
  });

  it("unwraps Debezium after.event object and string payloads", () => {
    expect(
      mapErasureRequestedEnvelope({
        after: {
          event: {
            eventId: "evt-obj",
            data: { requestId: "req-obj", participantId: "part-obj" },
          },
        },
      }),
    ).toEqual({
      eventId: "evt-obj",
      requestId: "req-obj",
      participantId: "part-obj",
    });

    expect(
      mapErasureRequestedEnvelope(
        JSON.stringify({
          eventId: "evt-str",
          data: { requestId: "req-str", participantId: "part-str" },
        }),
      ),
    ).toEqual({
      eventId: "evt-str",
      requestId: "req-str",
      participantId: "part-str",
    });
  });

  it("unwraps schema registry payload and tolerates invalid JSON strings", () => {
    expect(
      mapErasureRequestedEnvelope({
        schema: { type: "record" },
        payload: {
          eventId: "evt-pr",
          data: { requestId: "req-pr", participantId: "part-pr" },
        },
      }),
    ).toEqual({
      eventId: "evt-pr",
      requestId: "req-pr",
      participantId: "part-pr",
    });

    expect(mapErasureRequestedEnvelope("not-json")).toEqual({
      eventId: "",
      requestId: "",
      participantId: "",
    });
  });

  it("reads top-level ids and legacy id/data shapes", () => {
    expect(
      mapErasureRequestedEnvelope({
        requestId: "req-top",
        participantId: "part-top",
        eventId: "evt-top",
      }),
    ).toEqual({
      eventId: "evt-top",
      requestId: "req-top",
      participantId: "part-top",
    });

    expect(
      mapErasureRequestedEnvelope({
        id: "legacy-1",
        data: { eventId: "evt-inner", requestId: "req-inner", participantId: "p" },
      }),
    ).toEqual({
      eventId: "legacy-1",
      requestId: "req-inner",
      participantId: "p",
    });

    expect(
      mapErasureRequestedEnvelope({
        id: "legacy-2",
        data: { participantId: "part-only" },
      }),
    ).toEqual({
      eventId: "legacy-2",
      requestId: "",
      participantId: "part-only",
    });
  });

  it("passes through non-Debezium records unchanged", () => {
    expect(
      mapErasureRequestedEnvelope({
        eventId: "plain",
        data: { requestId: "r", participantId: "p" },
        after: "ignored",
      }),
    ).toEqual({
      eventId: "plain",
      requestId: "r",
      participantId: "p",
    });
  });
});