import { describe, expect, it, vi } from "vitest";
import { HttpStatementLookup, InMemoryStatementLookup } from "./statement-lookup.port.js";

const invoice = { invoiceId: "iA", producerId: "P", consumerId: "A", total: "12.00", status: "Paid" };

describe("StatementLookupPort (REQ-015, REQ-059)", () => {
  it("InMemoryStatementLookup filters by participant and period; put replaces the period", async () => {
    const mem = new InMemoryStatementLookup();
    mem.put({ participantId: "P", period: "2026-10", currency: "EUR", invoices: [] });
    mem.put({ participantId: "P", period: "2026-10", currency: "EUR", invoices: [invoice] });
    mem.put({ participantId: "P", period: "2026-11", currency: "EUR", invoices: [] });
    mem.put({ participantId: "Q", period: "2026-10", currency: "EUR", invoices: [] });
    expect((await mem.list("P")).map((s) => s.period)).toEqual(["2026-10", "2026-11"]);
    expect(await mem.list("P", "2026-10")).toEqual([
      { participantId: "P", period: "2026-10", currency: "EUR", invoices: [invoice] },
    ]);
    mem.reset();
    expect(await mem.list("P")).toEqual([]);
  });

  it("HttpStatementLookup GETs AC-06 ListStatements and keeps only the payout view", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          statementId: "s1",
          participantId: "P",
          communityId: "C",
          period: "2026-10",
          currency: "EUR",
          netBalance: "12.00",
          invoices: [{ ...invoice, issuedAt: "2026-11-01" }],
        },
      ],
    });
    const http = new HttpStatementLookup("http://invoicing:8080/", fetchImpl as unknown as typeof fetch, "svc-token");
    await expect(http.list("P", "2026-10")).resolves.toEqual([
      { participantId: "P", period: "2026-10", currency: "EUR", invoices: [invoice] },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://invoicing:8080/internal/v1/statements?participantId=P&period=2026-10",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer svc-token",
          "x-intelligent-roles": "service",
        }),
      }),
    );
    await http.list("P");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "http://invoicing:8080/internal/v1/statements?participantId=P",
      expect.anything(),
    );
  });

  it("HttpStatementLookup throws on non-OK", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const http = new HttpStatementLookup("http://invoicing:8080", fetchImpl as unknown as typeof fetch, "tok");
    await expect(http.list("P")).rejects.toThrow(/failed with 503/);
  });
});
