import { describe, expect, it, vi } from "vitest";
import {
  ServiceTokenClient,
  buildServiceRequestHeaders,
} from "./service-token.client.js";

describe("ServiceTokenClient (INT-287)", () => {
  it("caches access tokens until near expiry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-1", expires_in: 300 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-2", expires_in: 300 }),
      });
    const client = new ServiceTokenClient({
      baseUrl: "http://kc",
      realm: "int",
      clientId: "module-service",
      clientSecret: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getAccessToken()).resolves.toBe("tok-1");
    await expect(client.getAccessToken()).resolves.toBe("tok-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("buildServiceRequestHeaders adds Bearer when client present", async () => {
    const client = new ServiceTokenClient({
      baseUrl: "http://kc",
      realm: "int",
      clientId: "module-service",
      clientSecret: "secret",
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ access_token: "abc", expires_in: 60 }),
      })) as unknown as typeof fetch,
    });
    const headers = await buildServiceRequestHeaders({
      sub: "ac-07-payments",
      tokenClient: client,
    });
    expect(headers.Authorization).toBe("Bearer abc");
    expect(headers["x-intelligent-roles"]).toBe("service");
  });
});
