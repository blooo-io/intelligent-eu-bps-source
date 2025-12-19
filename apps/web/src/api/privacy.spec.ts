import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { createDataSubjectRequest, getDataSubjectRequest } from "./privacy";

describe("privacy API (REQ-013)", () => {
  it("posts an export request with bearer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        participantId: "11111111-1111-1111-1111-111111111111",
        type: "export",
        status: "Accepted",
      }),
    });
    const result = await createDataSubjectRequest(
      "https://api.example/",
      "tok",
      { type: "export" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.type).toBe("export");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example/v1/data-subject-requests",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer tok",
        },
        body: JSON.stringify({ type: "export" }),
      },
    );
  });

  it("gets request status by id", async () => {
    const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: id,
        participantId: "11111111-1111-1111-1111-111111111111",
        type: "erasure",
        status: "Completed",
      }),
    });
    const result = await getDataSubjectRequest(
      "https://api.example",
      "tok",
      id,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.status).toBe("Completed");
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/data-subject-requests/${id}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer tok",
        },
      },
    );
  });

  it("throws ApiError on create failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(
      createDataSubjectRequest(
        "https://api.example",
        "tok",
        { type: "erasure" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError on get failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      getDataSubjectRequest(
        "https://api.example",
        "tok",
        "missing",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
