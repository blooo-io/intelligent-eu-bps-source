import type { ActorSourcePort } from "./actor-source.port.js";
import { createEwdsActorSource } from "./ewds-actor-source.adapter.js";
import { MockActorSourceAdapter } from "./mock-actor-source.adapter.js";

/**
 * Select ActorSourcePort from env (REQ-008).
 * ACTOR_SOURCE / ACTOR_SOURCE_ADAPTER = mock|ewds|none — default `none`.
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
  if (mode === "ewds") {
    return createEwdsActorSource(env);
  }
  return null;
}
