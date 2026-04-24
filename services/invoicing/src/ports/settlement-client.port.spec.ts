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
        kWh: "2.5",
        energyAmount: "1.25",
        vat: "0.10",
        currency: "EUR",
        rate: "1",
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

