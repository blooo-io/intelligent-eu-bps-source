import { describe, expect, it, vi } from "vitest";
import { ApiError, fetchMe } from "./me";

describe("fetchMe", () => {
  it("calls GET /v1/me with the bearer token", async () => {
    const body = {
      participantId: "11111111-1111-1111-1111-111111111111",
      communityId: "22222222-2222-2222-2222-222222222222",
      roles: ["member"],
      role: "consumer",
      readiness: "Invited",
      profile: { name: "", address: "", email: "" },
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    });

    const me = await fetchMe("https://api.example/", "tok", fetchImpl as unknown as typeof fetch);
    expect(me.readiness).toBe("Invited");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("throws ApiError on non-OK responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(
      fetchMe("https://api.example", "bad", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
