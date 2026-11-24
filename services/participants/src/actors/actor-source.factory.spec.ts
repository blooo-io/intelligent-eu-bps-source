import { describe, expect, it } from "vitest";
import { createActorSource } from "./actor-source.factory.js";
import { MockActorSourceAdapter } from "./mock-actor-source.adapter.js";

describe("createActorSource (REQ-008)", () => {
  it("returns null by default (none)", () => {
    expect(createActorSource({})).toBeNull();
  });

  it("returns MockActorSourceAdapter when ACTOR_SOURCE=mock", () => {
    const port = createActorSource({ ACTOR_SOURCE: "mock" });
    expect(port).toBeInstanceOf(MockActorSourceAdapter);
  });

  it("returns null for ewds until WS4 adapter is wired", () => {
    expect(createActorSource({ ACTOR_SOURCE: "ewds" })).toBeNull();
  });
});
