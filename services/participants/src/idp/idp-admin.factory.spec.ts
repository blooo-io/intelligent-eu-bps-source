import { describe, expect, it } from "vitest";
import { createIdpAdminPort } from "./idp-admin.factory.js";
import { KeycloakIdpAdapter } from "./keycloak-idp.adapter.js";
import { MockIdpAdapter } from "./mock-idp.adapter.js";

describe("createIdpAdminPort (INT-208)", () => {
  it("returns mock when forced or when secrets missing", () => {
    expect(createIdpAdminPort({ IDP_ADMIN_PROVIDER: "mock" })).toBeInstanceOf(
      MockIdpAdapter,
    );
    expect(createIdpAdminPort({})).toBeInstanceOf(MockIdpAdapter);
  });

  it("returns Keycloak adapter when credentials are present", () => {
    const port = createIdpAdminPort({
      KEYCLOAK_BASE_URL: "https://idp.example.test",
      KEYCLOAK_ADMIN_CLIENT_ID: "participants-admin",
      KEYCLOAK_ADMIN_CLIENT_SECRET: "secret",
    });
    expect(port).toBeInstanceOf(KeycloakIdpAdapter);
  });
});
