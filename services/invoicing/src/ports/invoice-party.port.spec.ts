import { describe, expect, it, vi } from "vitest";
import {
  createInvoiceParty,
  HttpInvoiceParty,
  MapInvoiceParty,
  StubInvoiceParty,
} from "./invoice-party.port.js";

describe("invoice-party.port (INT-440 / Task 2.9)", () => {
  it("returns StubInvoiceParty without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createInvoiceParty({})).toBeInstanceOf(StubInvoiceParty);
  });

  it("returns HttpInvoiceParty when PARTICIPANTS_INTERNAL_URL is set", () => {
    expect(
      createInvoiceParty({
        PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      }),
    ).toBeInstanceOf(HttpInvoiceParty);
  });

  it("HttpInvoiceParty maps 404 to null", async () => {
    const port = new HttpInvoiceParty(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 404 })) as never,
    );
    await expect(port.getInvoiceParty("missing")).resolves.toBeNull();
  });

  it("HttpInvoiceParty sends service auth to /internal/v1/participants/{id}/invoice-party", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
          name: "Paul Nguyen",
          address: "1 Fixture Lane",
          selfBillingMandate: { termsVersion: "v1", acceptedAt: null },
        }),
        { status: 200 },
      ),
    );
    const port = new HttpInvoiceParty(
      "http://participants:8080",
      fetchImpl as never,
    );
    const party = await port.getInvoiceParty(
      "66666666-7777-4888-9999-aaaaaaaaaaaa",
    );
    expect(party).toEqual({
      participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      name: "Paul Nguyen",
      address: "1 Fixture Lane",
      selfBillingMandate: { termsVersion: "v1", acceptedAt: null },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/participants/66666666-7777-4888-9999-aaaaaaaaaaaa/invoice-party",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("MapInvoiceParty keeps the unit-test seam", async () => {
    const port = new MapInvoiceParty(
      new Map([
        [
          "p1",
          {
            participantId: "p1",
            name: "Paul Nguyen",
            address: "1 Fixture Lane",
            selfBillingMandate: { termsVersion: "v1", acceptedAt: null },
          },
        ],
      ]),
    );
    await expect(port.getInvoiceParty("p1")).resolves.toMatchObject({
      name: "Paul Nguyen",
    });
    await expect(port.getInvoiceParty("missing")).resolves.toBeNull();
  });
});
