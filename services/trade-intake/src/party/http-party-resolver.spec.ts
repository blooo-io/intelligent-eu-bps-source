import { describe, expect, it, vi } from "vitest";
import { HttpPartyResolver } from "./http-party-resolver.js";

describe("HttpPartyResolver (INT-237)", () => {
  it("POSTs ResolveParty and maps participant + community", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
          communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
        }),
        { status: 200 },
      ),
    );
    const client = new HttpPartyResolver(
      "http://participants:8080",
      fetchImpl as never,
    );
    await expect(
      client.resolve("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toEqual({
      participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/parties:resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          marketId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
        }),
      }),
    );
  });

  it("returns null on 404", async () => {
    const client = new HttpPartyResolver(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 404 })) as never,
    );
    await expect(client.resolve("unknown-actor")).resolves.toBeNull();
  });

  it("throws on non-404 failure", async () => {
    const client = new HttpPartyResolver(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 503 })) as never,
    );
    await expect(client.resolve("actor")).rejects.toThrow(/503/);
  });
});
