import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import {
  listDiscrepancies,
  listIntakeAnomalies,
  listJobs,
  runJob,
} from "./operator";

const communityId = "22222222-2222-2222-2222-222222222222";
const jobId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("operator API (REQ-029 / REQ-041)", () => {
  it("lists discrepancies, anomalies and jobs with optional communityId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    await listDiscrepancies(
      "https://api.example/",
      "tok",
      communityId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://api.example/v1/reconciliation/discrepancies?communityId=${communityId}`,
    );
    await listIntakeAnomalies(
      "https://api.example",
      "tok",
      undefined,
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.example/v1/intake/anomalies");
    await listJobs(
      "https://api.example",
      "tok",
      communityId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(String(fetchImpl.mock.calls[2][0])).toContain("/v1/jobs?");
  });

  it("runs a job", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId,
        name: "StartRun",
        outcome: "Accepted",
      }),
    });
    const result = await runJob(
      "https://api.example",
      "tok",
      jobId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.outcome).toBe("Accepted");
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/jobs/${jobId}:run`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("throws ApiError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      listJobs(
        "https://api.example",
        "tok",
        undefined,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      runJob(
        "https://api.example",
        "tok",
        jobId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      listDiscrepancies(
        "https://api.example",
        "tok",
        undefined,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      listIntakeAnomalies(
        "https://api.example",
        "tok",
        undefined,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
