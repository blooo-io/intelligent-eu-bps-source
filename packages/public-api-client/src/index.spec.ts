import { describe, expect, it } from "vitest";
import {
  PUBLIC_OPENAPI_VERSION,
  type PublicSchemas,
  type paths,
} from "./index.js";

describe("public-api-client (INT-244)", () => {
  it("exports the public OpenAPI version", () => {
    expect(PUBLIC_OPENAPI_VERSION).toBe("1.0.0");
  });

  it("exposes Me and Invoice schema names for integrators", () => {
    type Me = PublicSchemas["Me"];
    type Invoice = PublicSchemas["Invoice"];
    const meProbe: Me = {
      participantId: "11111111-1111-1111-1111-111111111111",
      communityId: "22222222-2222-2222-2222-222222222222",
      roles: ["member"],
      readiness: "Ready",
      profile: { name: "Ada", address: "1 Rue", email: "ada@example.com" },
    };
    const invoiceProbe = {} as Invoice;
    expect(meProbe.roles).toContain("member");
    expect(invoiceProbe).toBeDefined();
  });

  it("types the GET /me path operation", () => {
    type GetMe = paths["/me"]["get"];
    const op = {} as GetMe;
    expect(op).toBeDefined();
  });
});
