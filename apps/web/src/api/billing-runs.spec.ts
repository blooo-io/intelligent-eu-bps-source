import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { getBillingRun, startBillingRun } from "./billing-runs";

const communityId = "22222222-2222-2222-2222-222222222222";
const runId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("billing-runs API (REQ-006)", () => {
  it("starts a periodic run", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runId,
        communityId,
        type: "periodic",
        period: "2026-09",
        status: "Collecting",
        version: 1,
      }),
    });
    const result = await startBillingRun(
      "https://api.example/",
      "tok",
      communityId,
      { type: "periodic", period: "2026-09" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.status).toBe("Collecting");
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/billing-runs`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer tok",
        },
        body: JSON.stringify({ type: "periodic", period: "2026-09" }),
      },
    );
  });

  it("gets run status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runId,
        communityId,
        type: "periodic",
        period: "2026-09",
        status: "Completed",
        version: 2,
      }),
    });
    const result = await getBillingRun(
      "https://api.example",
      "tok",
      runId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.version).toBe(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/billing-runs/${runId}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(
      startBillingRun(
        "https://api.example",
        "tok",
        communityId,
        { type: "early" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      getBillingRun(
        "https://api.example",
        "tok",
        runId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
