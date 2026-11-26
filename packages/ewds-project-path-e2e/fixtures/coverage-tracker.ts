/**
 * INT-453 — runtime registry so the suite fails if any S1–S14 scenario is skipped.
 * Uses globalThis so Vitest file isolation still shares one Set across specs.
 */
import type { ProjectPathScenarioId } from "./scenarios.js";

const KEY = "__int453_ewds_e2e_covered__";

function bag(): Set<ProjectPathScenarioId> {
  const g = globalThis as unknown as Record<string, Set<ProjectPathScenarioId>>;
  if (!g[KEY]) g[KEY] = new Set();
  return g[KEY];
}

export function markCovered(id: ProjectPathScenarioId): void {
  bag().add(id);
}

export function coveredIds(): ReadonlySet<ProjectPathScenarioId> {
  return bag();
}

export function resetCoverage(): void {
  bag().clear();
}
