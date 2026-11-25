import { describe, expect, it } from "vitest";
import { adapterMode, loadCgwConfig } from "./config.js";

describe("adapterMode (A8)", () => {
  it("A8: default is mock", () => {
    expect(adapterMode({}, "MARKET_ADAPTER")).toBe("mock");
  });

  it("accepts explicit ewds", () => {
    expect(adapterMode({ MARKET_ADAPTER: " ewds " }, "MARKET_ADAPTER")).toBe(
      "ewds",
    );
  });

  it("A8: 'rest' is refused (GSY off-chain REST is test-fixture only)", () => {
    expect(() =>
      adapterMode({ MARKET_ADAPTER: "rest" }, "MARKET_ADAPTER"),
    ).toThrow("MARKET_ADAPTER must be mock or ewds");
  });
});

describe("loadCgwConfig (NFR-017)", () => {
  it("requires CGW_BASE_URL", () => {
    expect(() => loadCgwConfig({ CGW_API_KEY: "k" }, "svc")).toThrow(
      "CGW_BASE_URL is required",
    );
  });

  it("NFR-017: ewds without CGW_API_KEY fails fast without echoing values", () => {
    expect(() =>
      loadCgwConfig({ CGW_BASE_URL: "http://cgw" }, "publication"),
    ).toThrow("CGW_API_KEY is required");
  });

  it("honours CGW_CLIENT_ID_PREFIX", () => {
    expect(
      loadCgwConfig(
        {
          CGW_BASE_URL: "http://c",
          CGW_API_KEY: "k",
          CGW_CLIENT_ID_PREFIX: "custom",
          HOSTNAME: "p0",
        },
        "ignored",
      ).clientId,
    ).toBe("customp0");
  });

  it("clientId is per pod and alphanumeric only (INT-439)", () => {
    expect(
      loadCgwConfig(
        {
          CGW_BASE_URL: "http://c",
          CGW_API_KEY: "k",
          HOSTNAME: "trade-intake-7f",
        },
        "trade-intake",
      ).clientId,
    ).toBe("tradeintaketradeintake7f");
  });

  it("INT-439: strips hyphens that CGW rejects", () => {
    expect(
      loadCgwConfig(
        {
          CGW_BASE_URL: "http://c",
          CGW_API_KEY: "k",
          HOSTNAME: "compliance-bcf8bdb4-hcnxt",
        },
        "ac-12-compliance",
      ).clientId,
    ).toBe("ac12compliancecompliancebcf8bdb4hcnxt");
  });
});