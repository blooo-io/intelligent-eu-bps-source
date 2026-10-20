import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetServiceJwtJwksCache,
  serviceJwtRequired,
  verifyServiceAccessToken,
} from "./service-jwt.js";

describe("service JWT (INT-287)", () => {
  afterEach(() => {
    resetServiceJwtJwksCache();
    delete process.env.SERVICE_JWT_REQUIRED;
  });

  it("serviceJwtRequired reads env", () => {
    expect(serviceJwtRequired({})).toBe(false);
    expect(serviceJwtRequired({ SERVICE_JWT_REQUIRED: "true" })).toBe(true);
  });

  it("verifies a signed service token with realm role service", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test";
    jwk.alg = "RS256";
    const getKey = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({
      realm_access: { roles: ["service"] },
      azp: "module-service",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("service-account-module-service")
      .setIssuer("http://keycloak/realms/int")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);

    const claims = await verifyServiceAccessToken(
      token,
      {
        jwksUrl: "http://unused/jwks",
        issuer: "http://keycloak/realms/int",
        audienceClientId: "module-service",
      },
      getKey,
    );
    expect(claims.tokenUse).toBe("service");
    expect(claims.roles).toContain("service");
  });

  it("rejects token without service role or matching azp", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test";
    jwk.alg = "RS256";
    const getKey = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({
      realm_access: { roles: ["member"] },
      azp: "web",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("user-1")
      .setIssuer("http://keycloak/realms/int")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);

    await expect(
      verifyServiceAccessToken(
        token,
        {
          jwksUrl: "http://unused/jwks",
          issuer: "http://keycloak/realms/int",
          audienceClientId: "module-service",
        },
        getKey,
      ),
    ).rejects.toThrow(/service_jwt_missing_service_role/);
  });
});
