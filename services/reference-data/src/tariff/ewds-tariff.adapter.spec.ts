import { describe, expect, it, vi } from "vitest";
import { CgwClient, InMemoryInboundStore } from "@intelligent/ewds-client";
import {
  createEwdsTariffAdapter,
  EwdsTariffAdapter,
  isEwdsTariffRecord,
  type EwdsTariffRecord,
  type TariffTopicConsumer,
} from "./ewds-tariff.adapter.js";
import { createTariffPort } from "./tariff.factory.js";
import { UAT004_TARIFF_COMMUNITY_ID } from "./tariff.port.js";
import { MockTariffAdapter } from "./mock-tariff.adapter.js";
import { formatUnitPrice, toDateKey, tariffCovers } from "./tariff-window.js";

const C = "c1000000-0000-4000-8000-000000000001";

describe("EwdsTariffAdapter (REQ-004)", () => {
  it("REQ-004: tariff for community C valid 2026-11-01..2027-01-01 -> getTariff(C,'2026-11-15T00:00:00Z') returns it; outside -> null", async () => {
    const adapter = new EwdsTariffAdapter(
      { pull: async () => [], done: async () => {} },
      60_000,
      false,
    );
    adapter.upsert({
      tariffId: "t-1",
      communityId: C,
      currency: "EUR",
      validFrom: "2026-11-01",
      validUntil: "2027-01-01",
      gridFeePerKWh: 0.045,
      levyPerKWh: 0.01,
      taxPerKWh: 0.005,
    });
    const hit = await adapter.getTariff(C, "2026-11-15T00:00:00Z");
    expect(hit?.tariffId).toBe("t-1");
    expect(hit?.gridFeePerKWh).toBe("0.0450");
    expect(hit?.source).toBe("ewds");

    expect(await adapter.getTariff(C, "2026-10-31T00:00:00Z")).toBeNull();
    expect(await adapter.getTariff(C, "2027-01-01T00:00:00Z")).toBeNull();
  });

  it("REQ-004: no tariff published -> null (caller prints 'grid fees billed by supplier/DSO')", async () => {
    const adapter = new EwdsTariffAdapter(
      { pull: async () => [], done: async () => {} },
      60_000,
      false,
    );
    expect(await adapter.getTariff(C, "2026-11-15T00:00:00Z")).toBeNull();
  });

  it("REQ-004: ingest upserts cache from consumer and getTariff does not pull", async () => {
    const record: EwdsTariffRecord = {
      tariffId: "t-2",
      communityId: C,
      currency: "CHF",
      validFrom: "2026-01-01",
      validUntil: null,
      gridFeePerKWh: 0.02,
      levyPerKWh: 0,
      taxPerKWh: 0.001,
    };
    const consumer: TariffTopicConsumer = {
      pull: vi.fn(async () => [
        { messageId: "m1", sender: "did:ethr:0xDSO", body: record },
      ]),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsTariffAdapter(consumer, 60_000, false);
    expect(await adapter.ingest()).toBe(1);
    expect(consumer.done).toHaveBeenCalledWith("m1", true);

    (consumer.pull as ReturnType<typeof vi.fn>).mockClear();
    const t = await adapter.getTariff(C, "2026-06-01");
    expect(t?.currency).toBe("CHF");
    expect(consumer.pull).not.toHaveBeenCalled();
  });

  it("INT-439: CGW pull failure returns 0 and does not throw", async () => {
    const consumer: TariffTopicConsumer = {
      pull: vi.fn(async () => {
        throw new Error("CGW /api/v2/messages returned 400: CHANNEL::NOT_FOUND");
      }),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsTariffAdapter(consumer, 60_000, false);
    await expect(adapter.ingest()).resolves.toBe(0);
  });

  it("formatUnitPrice maps 0.045 to 0.0450", () => {
    expect(formatUnitPrice(0.045)).toBe("0.0450");
    expect(formatUnitPrice(0.045123)).toBe("0.045123");
  });

  it("toDateKey and tariffCovers handle RFC 3339 and invalid inputs", () => {
    expect(toDateKey("2026-11-15T12:00:00Z")).toBe("2026-11-15");
    expect(toDateKey("not-a-date-xxxx")).toBe("not-a-date");
    expect(
      tariffCovers(
        { validFrom: "2026-01-01", validUntil: "2026-02-01" },
        "2026-01-15",
      ),
    ).toBe(true);
    expect(
      tariffCovers(
        { validFrom: "2026-01-01", validUntil: "2026-02-01" },
        "2026-02-01",
      ),
    ).toBe(false);
  });

  it("createTariffPort selects mock by default and ewds when TARIFF_ADAPTER=ewds", () => {
    expect(createTariffPort({})).toBeInstanceOf(MockTariffAdapter);
    expect(createTariffPort({ TARIFF_ADAPTER: "mock" })).toBeInstanceOf(
      MockTariffAdapter,
    );
    const ewds = createEwdsTariffAdapter(
      {},
      {
        consumer: { pull: async () => [], done: async () => {} },
        startPolling: false,
      },
    );
    expect(ewds).toBeInstanceOf(EwdsTariffAdapter);
    ewds.stop();
  });

  it("REQ-004 mock tariff returns the UAT-004 tariff on 2026-11-30", async () => {
    const mock = new MockTariffAdapter();
    const t = await mock.getTariff(UAT004_TARIFF_COMMUNITY_ID, "2026-11-30");
    expect(t?.gridFeePerKWh).toBe("0.0450");
    expect(
      await mock.getTariff(
        "c0ffee00-1234-4abc-8def-0123456789ab",
        "2026-11-30",
      ),
    ).toBeNull();
  });

  it("rejects non EUR/CHF currency on ingest and marks done(false)", async () => {
    const consumer: TariffTopicConsumer = {
      pull: vi.fn(async () => [
        {
          messageId: "m-bad",
          sender: "did:ethr:0xDSO",
          body: {
            tariffId: "t-x",
            communityId: C,
            currency: "USD",
            validFrom: "2026-01-01",
            gridFeePerKWh: 0.01,
            levyPerKWh: 0,
            taxPerKWh: 0,
          },
        },
      ]),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsTariffAdapter(consumer, 60_000, false);
    expect(await adapter.ingest()).toBe(0);
    expect(consumer.done).toHaveBeenCalledWith("m-bad", false);
    expect(await adapter.getTariff(C, "2026-06-01")).toBeNull();
  });

  it("getTariff prefers the latest validFrom among covering tariffs", async () => {
    const adapter = new EwdsTariffAdapter(
      { pull: async () => [], done: async () => {} },
      60_000,
      false,
    );
    adapter.upsert({
      tariffId: "old",
      communityId: C,
      currency: "EUR",
      validFrom: "2026-01-01",
      validUntil: null,
      gridFeePerKWh: 0.01,
      levyPerKWh: 0,
      taxPerKWh: 0,
    });
    adapter.upsert({
      tariffId: "new",
      communityId: C,
      currency: "EUR",
      validFrom: "2026-06-01",
      validUntil: null,
      gridFeePerKWh: 0.02,
      levyPerKWh: 0,
      taxPerKWh: 0,
    });
    expect((await adapter.getTariff(C, "2026-07-01"))?.tariffId).toBe("new");
  });

  it("createTariffPort(TARIFF_ADAPTER=ewds) builds via CGW env", () => {
    expect(() =>
      createTariffPort({
        TARIFF_ADAPTER: "ewds",
        CGW_BASE_URL: "http://cgw",
        // missing key
      }),
    ).toThrow(/CGW_API_KEY/);
  });

  it("createEwdsTariffAdapter stop clears the poll timer", () => {
    const adapter = createEwdsTariffAdapter(
      {},
      {
        consumer: { pull: async () => [], done: async () => {} },
        startPolling: true,
      },
    );
    adapter.stop();
    adapter.stop();
  });

  it("isEwdsTariffRecord rejects malformed bodies", () => {
    expect(isEwdsTariffRecord(null)).toBe(false);
    expect(isEwdsTariffRecord("x")).toBe(false);
    expect(isEwdsTariffRecord({})).toBe(false);
    expect(
      isEwdsTariffRecord({
        tariffId: "t",
        communityId: C,
        currency: "EUR",
        validFrom: "2026-01-01",
        gridFeePerKWh: 0.01,
        levyPerKWh: 0,
        taxPerKWh: 0,
      }),
    ).toBe(true);
    expect(
      isEwdsTariffRecord({
        tariffId: "t",
        communityId: C,
        currency: "EUR",
        validFrom: "2026-01-01",
        gridFeePerKWh: "0.01",
        levyPerKWh: 0,
        taxPerKWh: 0,
      }),
    ).toBe(false);
  });

  it("upsert ignores invalid currency; ingest re-entry returns 0", async () => {
    const consumer: TariffTopicConsumer = {
      pull: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return [];
      }),
      done: vi.fn(async () => {}),
    };
    const adapter = new EwdsTariffAdapter(consumer, 60_000, false);
    adapter.upsert({
      tariffId: "bad",
      communityId: C,
      currency: "USD",
      validFrom: "2026-01-01",
      gridFeePerKWh: 1,
      levyPerKWh: 0,
      taxPerKWh: 0,
    });
    expect(await adapter.getTariff(C, "2026-06-01")).toBeNull();

    const first = adapter.ingest();
    const second = await adapter.ingest();
    expect(second).toBe(0);
    await first;
  });

  it("createEwdsTariffAdapter wires CGW consumer with env topic overrides", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));
    const cgw = new CgwClient({
      baseUrl: "http://cgw",
      apiKey: "k",
      clientId: "ac-13-0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const adapter = createEwdsTariffAdapter(
      {
        EWDS_TARIFF_FQCN: "custom.tariff.sub",
        EWDS_TARIFF_TOPIC: "tariffCustom",
        EWDS_TOPIC_OWNER: "owner.did",
        EWDS_TARIFF_POLL_MS: "0",
      },
      { cgw, store: new InMemoryInboundStore(), startPolling: false },
    );
    expect(await adapter.ingest()).toBe(0);
    expect(fetchImpl).toHaveBeenCalled();
    const url = String(fetchImpl.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("custom.tariff.sub");
    expect(url).toContain("tariffCustom");
    adapter.stop();
  });

  it("getTariff skips other communities and non-covering windows", async () => {
    const adapter = new EwdsTariffAdapter(
      { pull: async () => [], done: async () => {} },
      60_000,
      false,
    );
    adapter.upsert({
      tariffId: "other",
      communityId: "d2000000-0000-4000-8000-000000000002",
      currency: "EUR",
      validFrom: "2026-01-01",
      validUntil: null,
      gridFeePerKWh: 0.01,
      levyPerKWh: 0,
      taxPerKWh: 0,
    });
    adapter.upsert({
      tariffId: "future",
      communityId: C,
      currency: "CHF",
      validFrom: "2027-01-01",
      validUntil: null,
      gridFeePerKWh: 0.01,
      levyPerKWh: 0,
      taxPerKWh: 0,
    });
    expect(await adapter.getTariff(C, "2026-06-01")).toBeNull();
  });
});
