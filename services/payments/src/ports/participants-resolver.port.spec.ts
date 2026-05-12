import { describe, expect, it, vi } from "vitest";
import {
  createParticipantsResolver,
  HttpParticipantsResolver,
  NoopParticipantsResolver,
} from "./participants-resolver.port.js";

describe("participants-resolver.port (INT-230)", () => {
  it("returns noop without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createParticipantsResolver({})).toBeInstanceOf(
      NoopParticipantsResolver,
    );
  });

  it("HttpParticipantsResolver maps IdP sub", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
          communityId: "a1000000-0000-4000-8000-000000000001",
        }),
        { status: 200 },
      ),
    );
    const client = new HttpParticipantsResolver(
      "http://participants:8080",
      fetchImpl as never,
    );
    await expect(
      client.resolveByIdpSub("b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f"),
    ).resolves.toEqual({
      participantId: "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
      communityId: "a1000000-0000-4000-8000-000000000001",
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
