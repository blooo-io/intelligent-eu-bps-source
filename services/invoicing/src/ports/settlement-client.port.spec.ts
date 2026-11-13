import { describe, expect, it, vi } from "vitest";
import {
  createSettlementClient,
  HttpSettlementClient,
  UnconfiguredSettlementClient,
} from "./settlement-client.port.js";

describe("HttpSettlementClient (INT-223)", () => {
  it("maps AC-05 JSON to PairSettlementInput", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        settlementId: "s1",
        runId: "r1",
        communityId: "c1",
        consumerId: "u1",
        producerId: "u2",
        tradeIds: ["t1"],
        lines: [
          {
            tradeId: "t1",
            deliveryStart: "2026-11-01T00:00:00Z",
            deliveryEnd: "2026-11-01T00:15:00Z",
            kWh: "10.000",
            pricePerKWh: "0.20",
            amount: "2.00",
          },
        ],
        carriedForwardIn: "0.00",
        kWh: "2.5",
        energyAmount: "1.25",
        vat: "0.10",
        currency: "EUR",
        rate: "1.0000",
        rateDate: "2026-11-30",
        periodFrom: "2026-11-01T00:00:00.000Z",
        periodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "periodic",
        vatRate: 0,
        producerStripeAccountId: "acct_x",
      }),
    })) as unknown as typeof fetch;

    const client = new HttpSettlementClient(
      "http://settlement:8080",
      fetchImpl,
    );
    const pair = await client.getPairSettlement("s1");
    expect(pair.settlementId).toBe("s1");
    expect(pair.energyAmount).toBe("1.25");
    expect(pair.producerStripeAccountId).toBe("acct_x");
    expect(pair.rateDate).toBe("2026-11-30");
    expect(pair.periodFrom).toBe("2026-11-01T00:00:00.000Z");
    expect(pair.settlementType).toBe("periodic");
    expect(pair.vatRate).toBe(0);
    expect(pair.lines).toEqual([
      expect.objectContaining({ tradeId: "t1", kWh: "10.000", amount: "2.00" }),
    ]);
    expect(pair.carriedForwardIn).toBe("0.00");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://settlement:8080/internal/v1/settlements/s1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-intelligent-roles": "service",
        }),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    const client = new HttpSettlementClient("http://settlement:8080", async () =>
      ({ ok: false, status: 503 }) as Response,
    );
    await expect(client.getPairSettlement("s1")).rejects.toThrow("503");
  });
});

describe("createSettlementClient (INT-223)", () => {
  it("returns Unconfigured when SETTLEMENT_INTERNAL_URL unset", () => {
    expect(createSettlementClient({})).toBeInstanceOf(
      UnconfiguredSettlementClient,
    );
  });

  it("returns Http when SETTLEMENT_INTERNAL_URL set", () => {
    expect(
      createSettlementClient({
        SETTLEMENT_INTERNAL_URL: "http://settlement:8080",
      }),
    ).toBeInstanceOf(HttpSettlementClient);
  });

  it("UnconfiguredSettlementClient rejects hydrate", async () => {
    await expect(
      new UnconfiguredSettlementClient().getPairSettlement("s1"),
    ).rejects.toThrow("SETTLEMENT_INTERNAL_URL");
  });
});

