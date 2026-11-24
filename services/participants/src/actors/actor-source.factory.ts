import type { ActorSourcePort } from "./actor-source.port.js";
import { MockActorSourceAdapter } from "./mock-actor-source.adapter.js";

/**
 * Select ActorSourcePort from env (REQ-008).
 * ACTOR_SOURCE=mock|ewds|none — default `none`. `ewds` is wired by WS4.
 */
export function createActorSource(
  env: NodeJS.ProcessEnv = process.env,
): ActorSourcePort | null {
  const mode = (
    env.ACTOR_SOURCE ??
    env.ACTOR_SOURCE_ADAPTER ??
    "none"
  ).toLowerCase();
  if (mode === "mock") {
    return new MockActorSourceAdapter();
  }
  // WS4 provides the live EWDS adapter; until then treat as disabled.
  if (mode === "ewds") {
    return null;
  }
  return null;
}
