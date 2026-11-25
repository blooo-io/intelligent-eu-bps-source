import { describe, expect, it } from "vitest";
import { EwdsMarketAdapter } from "./ewds-market.adapter.js";
import { createMarketPort } from "./market.factory.js";

describe("createMarketPort (A8 / Task 4.10)", () => {
  it("A8: default MARKET_ADAPTER yields the mock market", () => {
    expect(createMarketPort({}).constructor.name).not.toBe("EwdsMarketAdapter");
    expect(createMarketPort({})).not.toBeInstanceOf(EwdsMarketAdapter);
  });

  it("A8: MARKET_ADAPTER=ewds yields EwdsMarketAdapter", () => {
    const port = createMarketPort({
      MARKET_ADAPTER: "ewds",
      CGW_BASE_URL: "http://c",
      CGW_API_KEY: "k",
    });
    expect(port).toBeInstanceOf(EwdsMarketAdapter);
  });
});
