import { describe, expect, it, vi } from "vitest";
import {
  createEwdsErasureRequest,
  EwdsErasureRequestAdapter,
  isGdprDataSubjectRequest,
  type ErasureTopicConsumer,
  type GdprDataSubjectRequest,
} from "./ewds-erasure-request.adapter.js";
import type { InboundErasureRequest } from "../erasure/erasure-request.port.js";

const CONTROLLER = "did:ethr:0xCONTROLLER";
const OTHER = "did:ethr:0xOTHER";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("EwdsErasureRequestAdapter (REQ-013)", () => {
  it("REQ-013: erasure request from controller DID is returned; from other DID is rejected", async () => {
    const done: Array<{ id: string; ok: boolean }> = [];
    const consumer: ErasureTopicConsumer = {
      pull: vi.fn(async () => [
        {
          messageId: "m-good",
          sender: CONTROLLER,
          body: sampleBody(),
        },
        {
          messageId: "m-bad",
          sender: OTHER,
          body: sampleBody({ actorId: "22222222-2222-4222-8222-222222222222" }),
        },
      ]),
      done: vi.fn(async (id, ok) => {
        done.push({ id, ok });
      }),
    };
    const adapter = new EwdsErasureRequestAdapter(
      consumer,
      [CONTROLLER],
      60_000,
    );
    const seen: InboundErasureRequest[] = [];
    adapter.onRequest(async (r) => {
      seen.push(r);
    });
    await adapter.tick();
    adapter.stop();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.externalRequestId).toBe("m-good");
    expect(seen[0]?.issuedBy).toBe(CONTROLLER);
    expect(done).toContainEqual({ id: "m-bad", ok: false });
  });

  it("REQ-013: reportOutcome marks the CGW message done", async () => {
    const consumer: ErasureTopicConsumer = {
      pull: vi.fn(async () => [
        { messageId: "m1", sender: CONTROLLER, body: sampleBody() },
      ]),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsErasureRequestAdapter(
      consumer,
      [CONTROLLER],
      60_000,
    );
    adapter.onRequest(async () => {});
    await adapter.tick();
    await adapter.reportOutcome("m1", {
      status: "completed",
      requestId: "req-1",
      invoicesRetainedUntil: "2031-12-31",
    });
    adapter.stop();
    expect(consumer.done).toHaveBeenCalledWith("m1", true);
  });

  it("isGdprDataSubjectRequest accepts erasure and export shapes", () => {
    expect(isGdprDataSubjectRequest(sampleBody())).toBe(true);
    expect(
      isGdprDataSubjectRequest({ ...sampleBody(), type: "export" }),
    ).toBe(true);
    expect(isGdprDataSubjectRequest({ actorId: "x" })).toBe(false);
  });

  it("createEwdsErasureRequest uses injected consumer", async () => {
    const consumer: ErasureTopicConsumer = {
      pull: vi.fn(async () => []),
      done: vi.fn(async () => {}),
    };
    const adapter = createEwdsErasureRequest(
      { EWDS_ERASURE_ALLOWED_DIDS: CONTROLLER },
      { consumer },
    );
    expect(adapter).toBeInstanceOf(EwdsErasureRequestAdapter);
    adapter.stop();
  });
});

function sampleBody(
  overrides: Partial<GdprDataSubjectRequest> = {},
): GdprDataSubjectRequest {
  return {
    actorId: ACTOR,
    communityId: COMMUNITY,
    type: "erasure",
    controllerRef: CONTROLLER,
    ...overrides,
  };
}
