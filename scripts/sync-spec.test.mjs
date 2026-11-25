import assert from "node:assert/strict";
import test from "node:test";
import {
  findConfidentialMarkers,
  mergeUatNote,
} from "./sync-spec.mjs";

const repo = `---
id: UAT-001
type: uat
requirement: "[[REQ-001]]"
status: "Pass"
scope_d55: in
spec_status: draft
last_run: 2026-10-17
tester: automated
given: "a"
when: "b"
then: "c"
---
# UAT-001 → REQ-001

## Run notes

- 2026-10-17 INT-75: S6/S7 via mocks.
`;

test("NFR-010 unchanged case keeps Pass and notes", () => {
  const vault = repo
    .replace('status: "Pass"', "status: Not Run")
    .replace("last_run: 2026-10-17", "last_run: null")
    .replace("tester: automated", "tester: null")
    .replace(/- 2026-10-17.*\n/, "");
  const { text, rerun } = mergeUatNote(vault, repo, "2026-11-25");
  assert.equal(rerun, false);
  assert.match(text, /^status: "Pass"$/m);
  assert.match(text, /INT-75: S6\/S7 via mocks/);
});

test("NFR-010 changed then resets status and records why", () => {
  const vault = repo
    .replace('then: "c"', "then: 'd'")
    .replace('"[[REQ-001]]"', "'[[REQ-001]]'");
  const { text, rerun } = mergeUatNote(vault, repo, "2026-11-25");
  assert.equal(rerun, true);
  assert.match(text, /^status: "Not Run"$/m);
  assert.match(text, /^requirement: "\[\[REQ-001\]\]"$/m);
  assert.match(text, /2026-11-25 Spec v6\.1 changed this case/);
});

test("NFR-010 new vault UAT is copied as Not Run", () => {
  assert.equal(
    mergeUatNote(repo.replace("UAT-001", "UAT-076"), null, "2026-11-25").rerun,
    true,
  );
});

test("A10.7 confidential markers block the copy", () => {
  assert.deepEqual(
    findConfidentialMarkers("open → Q-" + "034; see docs/project-" + "context/"),
    ["Q-034", "project-context"],
  );
});
