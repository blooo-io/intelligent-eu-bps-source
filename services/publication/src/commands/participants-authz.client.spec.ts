import { describe, expect, it, vi } from "vitest";
import { HttpActorAuthzClient } from "./participants-authz.client.js";

describe("HttpActorAuthzClient (REQ-052)", () => {
  it("GETs actors/:id/authorization with service auth", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        actorId: "a1",
        status: "active",
        memberships: [],
      }),
    );
    const client = new HttpActorAuthzClient(
      "http://participants:8080/",
      fetchImpl as unknown as typeof fetch,
      "tok-1",
    );
    const view = await client.getAuthorization("a1");
    expect(view.status).toBe("active");
    expect(client.calls).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/actors/a1/authorization",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer tok-1",
        }),
      }),
    );
  });

  it("throws when participants returns non-OK", async () => {
    const client = new HttpActorAuthzClient(
      "http://participants:8080",
      vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
    );
    await expect(client.getAuthorization("x")).rejects.toThrow(/500/);
  });
});
