import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { putMyProfile } from "./profile";

describe("putMyProfile (REQ-009 / UAT-009)", () => {
  it("PUTs name, address and email with the bearer token", async () => {
    const profile = { name: "Ada", address: "1 Rue", email: "ada@example.com" };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => profile,
    });

    const result = await putMyProfile(
      "https://api.example/",
      "tok",
      profile,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/profile", {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer tok",
      },
      body: JSON.stringify(profile),
    });
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      putMyProfile(
        "https://api.example",
        "tok",
        { name: "x", address: "y", email: "z@z.com" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
