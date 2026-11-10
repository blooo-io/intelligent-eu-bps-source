import { describe, expect, it, vi } from "vitest";
import {
  createParticipantCommunity,
  HttpParticipantCommunity,
  NoopParticipantCommunity,
} from "./participant-community.port.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

describe("participant-community.port (INT-336)", () => {
  it("returns noop without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createParticipantCommunity({})).toBeInstanceOf(
      NoopParticipantCommunity,
    );
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

  it("HttpParticipantCommunity fails on a server error", async () => {
    const client = new HttpParticipantCommunity(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 503 })) as never,
      "test-token",
    );
    await expect(client.communityOf(PARTICIPANT)).rejects.toThrow(/503/);
  });
});
