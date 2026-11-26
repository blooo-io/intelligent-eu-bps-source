import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordScenarioEvidence } from "./evidence-recorder.js";

describe("evidence-recorder (INT-458)", () => {
  let dir: string | undefined;
  const prev = process.env.EWDS_EVIDENCE_DIR;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env.EWDS_EVIDENCE_DIR;
    else process.env.EWDS_EVIDENCE_DIR = prev;
  });

  it("no-ops without EWDS_EVIDENCE_DIR", () => {
    delete process.env.EWDS_EVIDENCE_DIR;
    expect(() =>
      recordScenarioEvidence("S1", {
        run_path: "mock",
        input: { a: 1 },
        output: { b: 2 },
      }),
    ).not.toThrow();
  });

  it("writes input/output + index when EWDS_EVIDENCE_DIR is set", () => {
    dir = mkdtempSync(path.join(tmpdir(), "ewds-ev-"));
    process.env.EWDS_EVIDENCE_DIR = dir;
    recordScenarioEvidence("S8", {
      run_path: "mock",
      input: { command: "startPayment" },
      output: { ok: true },
      notes: "fixture",
    });
    const input = JSON.parse(
      readFileSync(path.join(dir, "ewds-s08/input.json"), "utf8"),
    );
    const output = JSON.parse(
      readFileSync(path.join(dir, "ewds-s08/output.json"), "utf8"),
    );
    const index = JSON.parse(
      readFileSync(path.join(dir, "s1-s14-index.json"), "utf8"),
    );
    expect(input).toEqual({ command: "startPayment" });
    expect(output).toEqual({ ok: true });
    expect(index.scenarios).toHaveLength(1);
    expect(index.scenarios[0].id).toBe("S8");
    expect(index.scenarios[0].run_path).toBe("mock");
  });
});
