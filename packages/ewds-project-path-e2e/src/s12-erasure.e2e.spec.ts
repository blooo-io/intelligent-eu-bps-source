/**
 * INT-453 — S12 data-subject erasure via EWDS erasure topic adapter.
 */
import { describe, expect, it, vi } from "vitest";
import { EwdsErasureRequestAdapter } from "@compliance/ports/ewds-erasure-request.adapter.js";
import type { InboundErasureRequest } from "@compliance/erasure/erasure-request.port.js";
import { IDS } from "../fixtures/scenarios.js";
import { markCovered } from "../fixtures/coverage-tracker.js";

const CONTROLLER = "did:ethr:0xController";

describe("INT-453 E2E S12 erasure", () => {
  it("S12: EWDS erasure request from controller DID is accepted and completed", async () => {
    const seen: InboundErasureRequest[] = [];
    const consumer = {
      pull: vi.fn(async () => [
        {
          messageId: "erase-msg-1",
          sender: CONTROLLER,
          body: {
            actorId: IDS.consumer,
            communityId: IDS.community,
            type: "erasure" as const,
            controllerRef: CONTROLLER,
          },
        },
      ]),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsErasureRequestAdapter(consumer, [CONTROLLER], 60_000);
    adapter.onRequest(async (r) => {
      seen.push(r);
    });
    await adapter.tick();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      actorId: IDS.consumer,
      communityId: IDS.community,
    });
    // Identifiers only — no email/name on the wire (NFR-002).
    expect(JSON.stringify(seen[0])).not.toMatch(/@/);

    await adapter.reportOutcome(seen[0]!.externalRequestId, {
      status: "completed",
      requestId: "req-e2e-1",
      invoicesRetainedUntil: "2031-12-31",
    });
    expect(consumer.done).toHaveBeenCalledWith("erase-msg-1", true);
    adapter.stop();
    markCovered("S12");
  });
});
