import { describe, expect, it, vi } from "vitest";
import {
  createParticipantsResolver,
  HttpParticipantsResolver,
  NoopParticipantsResolver,
} from "./participants-resolver.port.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("participants-resolver.port (INT-373)", () => {
  it("returns noop without PARTICIPANTS_INTERNAL_URL", async () => {
    expect(createParticipantsResolver({})).toBeInstanceOf(NoopParticipantsResolver);
    await expect(new NoopParticipantsResolver().resolveByIdpSub()).resolves.toBeNull();
  });

  it("maps an IdP sub to the registry participant", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ participantId: PARTICIPANT, communityId: COMMUNITY }), {
        status: 200,
      }),
    );
    const client = new HttpParticipantsResolver(
      "http://participants:8080/",
      fetchImpl as never,
      "test-token",
    );
    await expect(client.resolveByIdpSub("sub-1")).resolves.toEqual({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "http://participants:8080/internal/v1/participants:by-idp-sub/sub-1",
    );
  });

  it("returns null on 404 and on an incomplete body", async () => {
    const missing = new HttpParticipantsResolver(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 404 })) as never,
      "test-token",
    );
    await expect(missing.resolveByIdpSub("unknown")).resolves.toBeNull();

    const partial = new HttpParticipantsResolver(
      "http://participants:8080",
      vi.fn(async () => new Response(JSON.stringify({ participantId: PARTICIPANT }), { status: 200 })) as never,
      "test-token",
    );
    await expect(partial.resolveByIdpSub("sub")).resolves.toBeNull();
  });

  it("fails on a server error", async () => {
    const client = new HttpParticipantsResolver(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 500 })) as never,
      "test-token",
    );
    await expect(client.resolveByIdpSub("sub")).rejects.toThrow(/500/);
  });
});
