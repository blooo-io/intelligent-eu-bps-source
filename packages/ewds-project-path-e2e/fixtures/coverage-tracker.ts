/**
 * INT-453 — runtime registry so the suite fails if any S1–S14 scenario is skipped.
 * Uses globalThis so Vitest file isolation still shares one Set across specs.
 * INT-458 — optional evidence pack (input/output) when EWDS_EVIDENCE_DIR is set.
 */
import type { ProjectPathScenarioId } from "./scenarios.js";
import {
  recordScenarioEvidence,
  type ScenarioEvidence,
} from "./evidence-recorder.js";

const KEY = "__int453_ewds_e2e_covered__";

function bag(): Set<ProjectPathScenarioId> {
  const g = globalThis as unknown as Record<string, Set<ProjectPathScenarioId>>;
  if (!g[KEY]) g[KEY] = new Set();
  return g[KEY];
}

export function markCovered(
  id: ProjectPathScenarioId,
  evidence?: ScenarioEvidence,
): void {
  bag().add(id);
  if (evidence) recordScenarioEvidence(id, evidence);
}

export function coveredIds(): ReadonlySet<ProjectPathScenarioId> {
  return bag();
}

export function resetCoverage(): void {
  bag().clear();
}
