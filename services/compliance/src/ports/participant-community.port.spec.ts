import { describe, expect, it, vi } from "vitest";
import {
  createParticipantCommunity,
  HttpParticipantCommunity,
  NoopParticipantCommunity,
} from "./participant-community.port.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("participant-community.port (INT-336)", () => {
  it("returns noop without PARTICIPANTS_INTERNAL_URL", async () => {
    const client = createParticipantCommunity({});
    expect(client).toBeInstanceOf(NoopParticipantCommunity);
    await expect(client.resolveByIdpSub("sub-1")).resolves.toBeNull();
  });

  it("HttpParticipantCommunity reads communityId", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ participantId: PARTICIPANT, communityId: COMMUNITY }), {
        status: 200,
      }),
    );
    const client = new HttpParticipantCommunity(
      "http://participants:8080",
      fetchImpl as never,
      "test-token",
    );
    await expect(client.communityOf(PARTICIPANT)).resolves.toBe(COMMUNITY);
  });

  it("HttpParticipantCommunity returns null on 404 or an empty body", async () => {
    const missing = new HttpParticipantCommunity(
      "http://participants:8080/",
      vi.fn(async () => new Response("", { status: 404 })) as never,
      "test-token",
    );
    await expect(missing.communityOf(PARTICIPANT)).resolves.toBeNull();

    const empty = new HttpParticipantCommunity(
      "http://participants:8080",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as never,
      "test-token",
    );
    await expect(empty.communityOf(PARTICIPANT)).resolves.toBeNull();
  });

  it("HttpParticipantCommunity resolves an IdP subject (INT-375)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ participantId: PARTICIPANT, communityId: COMMUNITY }),
        { status: 200 },
      ),
    );
    const client = new HttpParticipantCommunity(
      "http://participants:8080",
      fetchImpl as never,
      "test-token",
    );
    await expect(client.resolveByIdpSub("kc-sub")).resolves.toEqual({
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/participants:by-idp-sub/kc-sub",
      expect.objectContaining({ method: "GET" }),
    );

    const missing = new HttpParticipantCommunity(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 404 })) as never,
      "test-token",
    );
    await expect(missing.resolveByIdpSub("unknown")).resolves.toBeNull();

    const partial = new HttpParticipantCommunity(
      "http://participants:8080",
      vi.fn(async () => new Response(JSON.stringify({ participantId: PARTICIPANT }), { status: 200 })) as never,
      "test-token",
    );
    await expect(partial.resolveByIdpSub("sub")).resolves.toBeNull();

    const down = new HttpParticipantCommunity(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 500 })) as never,
      "test-token",
    );
    await expect(down.resolveByIdpSub("sub")).rejects.toThrow(/500/);
  });

  it("HttpParticipantCommunity fails on a server error", async () => {
    const client = new HttpParticipantCommunity(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 503 })) as never,
      "test-token",
    );
    await expect(client.communityOf(PARTICIPANT)).rejects.toThrow(/503/);
  });
});
