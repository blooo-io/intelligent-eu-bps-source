import { describe, expect, it, vi } from "vitest";
import { HttpTradeSource } from "./http-trade-source.js";

describe("HttpTradeSource (INT-232)", () => {
  it("maps AC-04 unbilled DTOs to UnbilledTrade", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            tradeId: "0xabc",
            consumerId: "11111111-2222-4333-8444-555555555555",
            producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
            communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
            kWh: "10.00",
            price: "0.20",
            status: "settled",
          },
        ]),
        { status: 200 },
      ),
    );
    const source = new HttpTradeSource(
      "http://trade-intake:8080",
      fetchImpl as never,
    );
    const rows = await source.getUnbilled(
      "c0ffee00-1234-4abc-8def-0123456789ab",
      "2026-11-28T23:59:59Z",
    );
    expect(rows).toEqual([
      {
        tradeId: "0xabc",
        consumerId: "11111111-2222-4333-8444-555555555555",
        producerId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
        communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
        kWh: 10,
        pricePerKWhEur: 0.2,
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [calledUrl] = fetchImpl.mock.calls[0]!;
    expect(String(calledUrl)).toContain("communityId=c0ffee00");
    expect(String(calledUrl)).toContain("until=");
  });

  it("POSTs mark-billed tradeIds", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const source = new HttpTradeSource(
      "http://trade-intake:8080",
      fetchImpl as never,
    );
    await source.markBilled(["t1", "t2"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://trade-intake:8080/internal/v1/trades:mark-billed",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tradeIds: ["t1", "t2"] }),
      }),
    );
  });
});
