import { describe, expect, it, vi } from "vitest";
import {
  createParticipantsResolver,
  HttpParticipantsResolver,
  NoopParticipantsResolver,
} from "./participants-resolver.port.js";

describe("participants-resolver.port (INT-236)", () => {
  it("returns noop without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createParticipantsResolver({})).toBeInstanceOf(
      NoopParticipantsResolver,
    );
  });

  it("HttpParticipantsResolver maps IdP sub", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: "11111111-2222-4333-8444-555555555555",
          communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
        }),
        { status: 200 },
      ),
    );
    const client = new HttpParticipantsResolver(
      "http://participants:8080",
      fetchImpl as never,
    );
    await expect(
      client.resolveByIdpSub("c1a55e01-0001-4000-8000-000000000001"),
    ).resolves.toEqual({
      participantId: "11111111-2222-4333-8444-555555555555",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
  });

  it("HttpParticipantsResolver returns null on 404", async () => {
    const client = new HttpParticipantsResolver(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 404 })) as never,
    );
    await expect(client.resolveByIdpSub("missing")).resolves.toBeNull();
  });
});
