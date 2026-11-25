import type { ActorSourcePort } from "./actor-source.port.js";
import { createEwdsActorSource } from "./ewds-actor-source.adapter.js";
import { MockActorSourceAdapter } from "./mock-actor-source.adapter.js";

/**
 * Select ActorSourcePort from env (REQ-008).
 * ACTOR_SOURCE / ACTOR_SOURCE_ADAPTER = mock|ewds|none — default `none`.
 * INT-440 — mock fixtures refused when NODE_ENV=production (cluster uses ewds).
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
    if (env.NODE_ENV === "production") {
      throw new Error(
        "ACTOR_SOURCE=mock refused when NODE_ENV=production (use ACTOR_SOURCE_ADAPTER=ewds)",
      );
    }
    return new MockActorSourceAdapter();
  }
  if (mode === "ewds") {
    return createEwdsActorSource(env);
  }
  return null;
}
