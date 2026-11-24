import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import { fetchMyStatements } from "./statements";

describe("statements API (REQ-059)", () => {
  it("lists statements", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          statementId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          participantId: "11111111-1111-1111-1111-111111111111",
          communityId: "22222222-2222-2222-2222-222222222222",
          period: "2026-10",
          periodFrom: "2026-10-01T00:00:00Z",
          periodUntil: "2026-11-01T00:00:00Z",
          totalBought: "6.25",
          totalSold: "20.50",
          netBalance: "14.25",
          direction: "to_receive",
          currency: "EUR",
          invoiceIds: ["i1", "i2", "i3"],
          status: "Open",
          revision: 1,
        },
      ],
    });
    const rows = await fetchMyStatements(
      "https://api.example/",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].netBalance).toBe("14.25");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/v1/me/statements", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tok",
      },
    });
  });

  it("throws on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(
      fetchMyStatements(
        "https://api.example",
        "tok",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
