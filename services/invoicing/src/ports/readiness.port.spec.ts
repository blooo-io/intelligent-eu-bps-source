import { describe, expect, it, vi } from "vitest";
import {
  AlwaysReadyReadiness,
  createReadiness,
  HttpReadiness,
  MapReadiness,
} from "./readiness.port.js";

describe("readiness.port (INT-231)", () => {
  it("returns AlwaysReady without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createReadiness({})).toBeInstanceOf(AlwaysReadyReadiness);
  });

  it("returns HttpReadiness when PARTICIPANTS_INTERNAL_URL is set", () => {
    expect(
      createReadiness({ PARTICIPANTS_INTERNAL_URL: "http://participants:8080" }),
    ).toBeInstanceOf(HttpReadiness);
  });

  it("HttpReadiness maps ready=true", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
          ready: true,
          status: "Ready",
        }),
        { status: 200 },
      ),
    );
    const port = new HttpReadiness("http://participants:8080", fetchImpl as never);
    await expect(
      port.check("66666666-7777-4888-9999-aaaaaaaaaaaa"),
    ).resolves.toEqual({ ready: true });
  });

  it("HttpReadiness maps 404 and ready=false", async () => {
    const notFound = new HttpReadiness(
      "http://participants:8080",
      vi.fn(async () => new Response("", { status: 404 })) as never,
    );
    await expect(notFound.check("missing")).resolves.toEqual({
      ready: false,
      reason: "producer_not_ready",
    });

    const notReady = new HttpReadiness(
      "http://participants:8080",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ready: false, reason: "readiness is TermsAccepted" }),
          { status: 200 },
        ),
      ) as never,
    );
    await expect(notReady.check("p1")).resolves.toEqual({
      ready: false,
      reason: "readiness is TermsAccepted",
    });
  });

  it("MapReadiness keeps unit-test seam", async () => {
    const map = new MapReadiness(new Map([["p1", true]]));
    await expect(map.check("p1")).resolves.toEqual({ ready: true });
    await expect(map.check("p2")).resolves.toEqual({
      ready: false,
      reason: "producer_not_ready",
    });
  });
});
