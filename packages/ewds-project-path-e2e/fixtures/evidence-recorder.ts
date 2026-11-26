/**
 * INT-458 — dump per-scenario input/output evidence packs.
 *
 * When `EWDS_EVIDENCE_DIR` is set, each {@link markCovered} with evidence
 * writes `ewds-sNN/input.json` + `output.json` + updates the run index.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ProjectPathScenarioId } from "./scenarios.js";
import { PROJECT_PATH_SCENARIOS } from "./scenarios.js";

export type ScenarioEvidence = {
  input: unknown;
  output: unknown;
  /** mock = in-process / Mock CGW; stripe-test = live Stripe test API. */
  run_path: "mock" | "stripe-test" | "mock+stripe-test";
  notes?: string;
};

type IndexEntry = {
  id: ProjectPathScenarioId;
  title: string;
  run_path: string;
  input: string;
  output: string;
  notes?: string;
  recordedAt: string;
};

function evidenceRoot(): string | undefined {
  const dir = process.env.EWDS_EVIDENCE_DIR?.trim();
  return dir && dir.length > 0 ? dir : undefined;
}

function scenarioDir(root: string, id: ProjectPathScenarioId): string {
  const n = id.replace(/^S/, "").padStart(2, "0");
  return path.join(root, `ewds-s${n}`);
}

function indexPath(root: string): string {
  return path.join(root, "s1-s14-index.json");
}

function loadIndex(root: string): {
  generatedAt: string;
  timezone: string;
  jira: string[];
  scenarios: IndexEntry[];
} {
  const p = indexPath(root);
  if (!existsSync(p)) {
    return {
      generatedAt: new Date().toISOString(),
      timezone: "Europe/Paris",
      jira: ["INT-458", "INT-453"],
      scenarios: [],
    };
  }
  return JSON.parse(readFileSync(p, "utf8")) as ReturnType<typeof loadIndex>;
}

/** Persist one scenario's I/O pack (no-op unless EWDS_EVIDENCE_DIR is set). */
export function recordScenarioEvidence(
  id: ProjectPathScenarioId,
  evidence: ScenarioEvidence,
): void {
  const root = evidenceRoot();
  if (!root) return;

  const dir = scenarioDir(root, id);
  mkdirSync(dir, { recursive: true });
  const inputRel = path.join(path.basename(dir), "input.json");
  const outputRel = path.join(path.basename(dir), "output.json");
  writeFileSync(
    path.join(dir, "input.json"),
    `${JSON.stringify(evidence.input, null, 2)}\n`,
  );
  writeFileSync(
    path.join(dir, "output.json"),
    `${JSON.stringify(evidence.output, null, 2)}\n`,
  );

  const meta = PROJECT_PATH_SCENARIOS.find((s) => s.id === id);
  const index = loadIndex(root);
  index.generatedAt = new Date().toISOString();
  index.scenarios = index.scenarios.filter((s) => s.id !== id);
  index.scenarios.push({
    id,
    title: meta?.title ?? id,
    run_path: evidence.run_path,
    input: inputRel,
    output: outputRel,
    notes: evidence.notes,
    recordedAt: new Date().toISOString(),
  });
  index.scenarios.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeFileSync(indexPath(root), `${JSON.stringify(index, null, 2)}\n`);
}
