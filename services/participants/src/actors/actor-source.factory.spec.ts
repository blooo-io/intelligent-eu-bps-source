import { describe, expect, it } from "vitest";
import { createActorSource } from "./actor-source.factory.js";
import { EwdsActorSourceAdapter } from "./ewds-actor-source.adapter.js";
import { MockActorSourceAdapter } from "./mock-actor-source.adapter.js";

describe("createActorSource (REQ-008)", () => {
  it("returns null by default (none)", () => {
    expect(createActorSource({})).toBeNull();
  });

  it("returns MockActorSourceAdapter when ACTOR_SOURCE=mock", () => {
    const port = createActorSource({ ACTOR_SOURCE: "mock" });
    expect(port).toBeInstanceOf(MockActorSourceAdapter);
  });

  it("returns EwdsActorSourceAdapter when ACTOR_SOURCE=ewds (CGW configured)", () => {
    const port = createActorSource({
      ACTOR_SOURCE: "ewds",
      CGW_BASE_URL: "http://cgw.test",
      CGW_API_KEY: "test-key",
    });
    expect(port).toBeInstanceOf(EwdsActorSourceAdapter);
  });

  it("returns EwdsActorSourceAdapter when ACTOR_SOURCE_ADAPTER=ewds", () => {
    const port = createActorSource({
      ACTOR_SOURCE_ADAPTER: "ewds",
      CGW_BASE_URL: "http://cgw.test",
      CGW_API_KEY: "test-key",
    });
    expect(port).toBeInstanceOf(EwdsActorSourceAdapter);
  });

  it("throws when ewds is selected without CGW_BASE_URL", () => {
    expect(() =>
      createActorSource({ ACTOR_SOURCE: "ewds", CGW_API_KEY: "k" }),
    ).toThrow(/CGW_BASE_URL/);
  });

  it("INT-440: mock ActorSource refused when NODE_ENV=production", () => {
    expect(() =>
      createActorSource({ ACTOR_SOURCE: "mock", NODE_ENV: "production" }),
    ).toThrow(/ACTOR_SOURCE=mock refused when NODE_ENV=production/);
  });
});
