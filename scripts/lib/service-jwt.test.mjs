import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import {
  buildInternalServiceHeaders,
  mintServiceAccessToken,
  resolveServiceJwtEnv,
  DEFAULT_MODULE_SERVICE_CLIENT,
} from "./service-jwt.mjs";

describe("service-jwt.mjs (INT-317)", () => {
  it("resolveServiceJwtEnv returns null without KEYCLOAK_BASE_URL", () => {
    assert.equal(resolveServiceJwtEnv({}), null);
  });

  it("resolveServiceJwtEnv applies module-service defaults", () => {
    const cfg = resolveServiceJwtEnv({
      KEYCLOAK_BASE_URL: "http://keycloak.example/",
    });
    assert.deepEqual(cfg, {
      baseUrl: "http://keycloak.example",
      realm: "int",
      clientId: DEFAULT_MODULE_SERVICE_CLIENT.clientId,
      clientSecret: DEFAULT_MODULE_SERVICE_CLIENT.secret,
      tokenHost: null,
    });
  });

  it("mintServiceAccessToken posts client_credentials via fetch without tokenHost", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { access_token: "tok-abc", expires_in: 60 };
        },
      };
    };
    const token = await mintServiceAccessToken(
      {
        baseUrl: "http://kc",
        realm: "int",
        clientId: "module-service",
        clientSecret: "secret",
        tokenHost: null,
      },
      fetchImpl,
    );
    assert.equal(token, "tok-abc");
    assert.equal(
      calls[0].url,
      "http://kc/realms/int/protocol/openid-connect/token",
    );
    assert.equal(calls[0].init.method, "POST");
    assert.match(String(calls[0].init.body), /grant_type=client_credentials/);
  });

  it("buildInternalServiceHeaders attaches Bearer when Keycloak configured", async () => {
    const headers = await buildInternalServiceHeaders({
      sub: "seed",
      env: { KEYCLOAK_BASE_URL: "http://kc" },
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { access_token: "jwt-1" };
        },
      }),
    });
    assert.equal(headers.Authorization, "Bearer jwt-1");
    assert.equal(headers["x-intelligent-sub"], "seed");
    assert.equal(headers["x-intelligent-token-use"], "service");
  });

  it("mintServiceAccessToken with tokenHost sends Host via node:http", async () => {
    /** @type {http.IncomingMessage | null} */
    let seen = null;
    const server = http.createServer((req, res) => {
      seen = req;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "host-tok" }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = /** @type {import("node:net").AddressInfo} */ (
      server.address()
    );
    try {
      const token = await mintServiceAccessToken({
        baseUrl: `http://127.0.0.1:${port}`,
        realm: "int",
        clientId: "module-service",
        clientSecret: "secret",
        tokenHost: "platform-keycloak-keycloakx-http.keycloak.svc.cluster.local",
      });
      assert.equal(token, "host-tok");
      assert.equal(
        seen?.headers.host,
        "platform-keycloak-keycloakx-http.keycloak.svc.cluster.local",
      );
    } finally {
      server.close();
    }
  });
});
