/**
 * INT-102 / BR-07 — GetVatRate defaults to 0.00 for known communities.
 */
import { describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { VatService } from "./vat.service.js";

describe("VatService (INT-102 / BR-07)", () => {
  it("returns 0.00 for the V1 fixture community", () => {
    const svc = new VatService();
    expect(
      svc.getVatRate("c0ffee00-1234-4abc-8def-0123456789ab"),
    ).toEqual({
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      vatRate: "0.00",
    });
  });

  it("throws NotFound for an unknown community", () => {
    const svc = new VatService();
    expect(() =>
      svc.getVatRate("00000000-0000-4000-8000-000000000001"),
    ).toThrow(NotFoundException);
  });

  it("setVatRate updates the community rate", () => {
    const svc = new VatService();
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    svc.setVatRate(id, "0.08");
    expect(svc.getVatRate(id).vatRate).toBe("0.08");
  });
});
