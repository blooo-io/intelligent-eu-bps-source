import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetServiceJwtJwksCache,
  resolveServiceJwtOptions,
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
    expect(serviceJwtRequired({ SERVICE_JWT_REQUIRED: "false" })).toBe(false);
  });

  it("INT-342 — production fails closed even when the flag is unset or false", () => {
    expect(serviceJwtRequired({ NODE_ENV: "production" })).toBe(true);
    expect(
      serviceJwtRequired({ NODE_ENV: "production", SERVICE_JWT_REQUIRED: "false" }),
    ).toBe(true);
  });

  // INT-348 — public KC_HOSTNAME iss while JWKS stays on in-cluster BASE_URL.
  it("resolveServiceJwtOptions prefers KEYCLOAK_ISSUER over BASE_URL", () => {
    const opts = resolveServiceJwtOptions({
      KEYCLOAK_BASE_URL:
        "http://platform-keycloak-keycloakx-http.keycloak.svc.cluster.local",
      KEYCLOAK_REALM: "int",
      KEYCLOAK_ISSUER: "https://auth.intelligent-eu-bp.blooo.dev/realms/int",
      KEYCLOAK_SERVICE_CLIENT_ID: "module-service",
    });
    expect(opts?.issuer).toBe(
      "https://auth.intelligent-eu-bp.blooo.dev/realms/int",
    );
    expect(opts?.jwksUrl).toContain(
      "platform-keycloak-keycloakx-http.keycloak.svc.cluster.local",
    );
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

  // NFR-013 / INT-357 — role claim path comes from OIDC_ROLE_CLAIM.
  it("resolveServiceJwtOptions carries the configured role claim path", () => {
    const base = { KEYCLOAK_BASE_URL: "http://kc", KEYCLOAK_REALM: "int" };
    expect(resolveServiceJwtOptions(base)?.roleClaim).toBe("realm_access.roles");
    expect(
      resolveServiceJwtOptions({ ...base, OIDC_ROLE_CLAIM: "roles" })?.roleClaim,
    ).toBe("roles");
  });

  it("reads the service role from a custom flat role claim", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test";
    jwk.alg = "RS256";
    const getKey = createLocalJWKSet({ keys: [jwk] });
    const token = await new SignJWT({ roles: ["service"], azp: "other" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("svc")
      .setIssuer("http://idp")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
    const options = {
      jwksUrl: "http://unused/jwks",
      issuer: "http://idp",
      audienceClientId: "module-service",
    };

    const claims = await verifyServiceAccessToken(
      token,
      { ...options, roleClaim: "roles" },
      getKey,
    );
    expect(claims.roles).toEqual(["service"]);
    // Default path ignores the flat claim → no service role, azp mismatch.
    await expect(verifyServiceAccessToken(token, options, getKey)).rejects.toThrow(
      /service_jwt_missing_service_role/,
    );
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
