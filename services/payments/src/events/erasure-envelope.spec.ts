/**
 * Branch coverage for Debezium / legacy outbox envelope unwrap (INT-275 / INT-424).
 */

import { describe, expect, it } from "vitest";
import {
  mapErasureRequestedEnvelope,
  unwrapEnvelope,
} from "./erasure-envelope.js";

describe("erasure-envelope unwrap (INT-424)", () => {
  it("returns {} for non-JSON strings", () => {
    expect(unwrapEnvelope("{not-json")).toEqual({});
  });

  it("parses a JSON string payload", () => {
    expect(
      unwrapEnvelope(
        JSON.stringify({
          eventId: "e1",
          data: { requestId: "r1", participantId: "p1" },
        }),
      ),
    ).toMatchObject({ eventId: "e1" });
  });

  it("unwraps Kafka Connect schema/payload envelopes", () => {
    expect(
      unwrapEnvelope({
        schema: { type: "struct" },
        payload: { eventId: "e2", data: { requestId: "r2", participantId: "p2" } },
      }),
    ).toMatchObject({ eventId: "e2" });
  });

  it("unwraps Debezium after.event as object or JSON string", () => {
    expect(
      unwrapEnvelope({
        after: {
          event: { eventId: "e3", data: { requestId: "r3", participantId: "p3" } },
        },
      }),
    ).toMatchObject({ eventId: "e3" });

    expect(
      unwrapEnvelope({
        after: {
          event: JSON.stringify({
            eventId: "e4",
            data: { requestId: "r4", participantId: "p4" },
          }),
        },
      }),
    ).toMatchObject({ eventId: "e4" });

    // after without nested event → keep original record
    expect(unwrapEnvelope({ after: { foo: 1 }, eventId: "keep" })).toMatchObject({
      eventId: "keep",
    });
  });

  it("unwraps legacy { id, data } envelopes without eventId", () => {
    expect(
      unwrapEnvelope({
        id: "legacy-1",
        data: { eventId: "e5", data: { requestId: "r5", participantId: "p5" } },
      }),
    ).toMatchObject({ eventId: "e5" });

    // data already has requestId → keep outer record
    expect(
      unwrapEnvelope({
        id: "legacy-2",
        data: { requestId: "r6", participantId: "p6" },
      }),
    ).toMatchObject({ id: "legacy-2" });

    // data without eventId → synthesize from id
    expect(
      unwrapEnvelope({
        id: "legacy-3",
        data: { participantId: "p7" },
      }),
    ).toMatchObject({ eventId: "legacy-3" });
  });

  it("mapErasureRequestedEnvelope reads nested or top-level fields", () => {
    expect(
      mapErasureRequestedEnvelope({
        eventId: "e8",
        data: { requestId: "r8", participantId: "p8" },
      }),
    ).toEqual({ eventId: "e8", requestId: "r8", participantId: "p8" });

    expect(
      mapErasureRequestedEnvelope({
        id: "e9",
        requestId: "r9",
        participantId: "p9",
      }),
    ).toEqual({ eventId: "e9", requestId: "r9", participantId: "p9" });
  });
});
