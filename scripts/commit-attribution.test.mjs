import assert from "node:assert/strict";
import test from "node:test";
import {
  commitHasAssistantAttribution,
  stripAssistantAttribution,
  textCreditsAssistant,
} from "./commit-attribution.mjs";

const trailer = "Co-authored-by: Cursor <cursoragent@cursor.com>";

test("strips an assistant co-author and keeps the message", () => {
  const message = `ci: INT-153 keep commit authorship with the project\n\n${trailer}\n`;
  const stripped = stripAssistantAttribution(message);
  assert.match(stripped, /INT-153/);
  assert.equal(commitHasAssistantAttribution(stripped), false);
  assert.equal(stripped.includes("Co-authored-by"), false);
});

test("keeps a human co-author", () => {
  const message = "docs: note\n\nCo-authored-by: Steven Lin <steven@blooo.io>\n";
  assert.equal(stripAssistantAttribution(message), message);
  assert.equal(commitHasAssistantAttribution(message), false);
});

test("detects an assistant co-author trailer", () => {
  assert.equal(commitHasAssistantAttribution(`subject\n\n${trailer}\n`), true);
});

test("does not treat the instruction directory as attribution", () => {
  assert.equal(textCreditsAssistant("See .cursor/rules/00-project.mdc"), false);
});

test("detects assistant credit in prose", () => {
  assert.equal(textCreditsAssistant("Made with Cursor"), true);
});
