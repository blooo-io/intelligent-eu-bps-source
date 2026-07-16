import { describe, expect, it, vi } from "vitest";
import {
  createReferenceData,
  HttpReferenceData,
} from "./reference-data.port.js";

describe("reference-data port (INT-272)", () => {
  it("returns null without REFERENCE_DATA_INTERNAL_URL", () => {
    expect(createReferenceData({})).toBeNull();
  });

  it("returns HttpReferenceData when REFERENCE_DATA_INTERNAL_URL is set", () => {
    expect(
      createReferenceData({
        REFERENCE_DATA_INTERNAL_URL: "http://reference-data:8080",
      }),
    ).toBeInstanceOf(HttpReferenceData);
  });

  it("HttpReferenceData reads VAT and FX", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/vat-rate")) {
        return Response.json({ communityId: "c1", vatRate: "0.08" });
      }
      return Response.json({ currency: "CHF", date: "2026-11-28", rate: "0.94" });
    });
    const client = new HttpReferenceData(
      "http://reference-data:8080",
      fetchImpl as never,
    );
    await expect(client.getVatRate("c1")).resolves.toBe(0.08);
    await expect(client.getRate("EUR", "2026-11-28")).resolves.toBe(1);
    await expect(client.getRate("CHF", "2026-11-28")).resolves.toBe(0.94);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("HttpReferenceData defaults empty bodies and throws on HTTP errors", async () => {
    const empty = new HttpReferenceData(
      "http://reference-data:8080/",
      vi.fn(async () => Response.json({})) as never,
    );
    await expect(empty.getVatRate("c1")).resolves.toBe(0);
    await expect(empty.getRate("CHF", "2026-11-28")).resolves.toBe(1);

    const fail = new HttpReferenceData(
      "http://reference-data:8080",
      vi.fn(async () => new Response(null, { status: 404 })) as never,
    );
    await expect(fail.getVatRate("c1")).rejects.toThrow(/failed with 404/);
    await expect(fail.getRate("CHF", "2026-11-28")).rejects.toThrow(
      /failed with 404/,
    );
  });
});
