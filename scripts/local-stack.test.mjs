import assert from "node:assert/strict";
import test from "node:test";
import { checkLocalStackLayout } from "./local-stack.mjs";

test("local stack layout matches TD-12 (INT-136)", async () => {
  const report = await checkLocalStackLayout();
  assert.deepEqual(report.missing, []);
  assert.equal(report.hasLocalEnvironment, true);
  assert.equal(report.hasMailpitRelease, true);
  assert.equal(report.mailpitEnabled, true);
  assert.equal(report.tiltUsesLocalHelmfile, true);
  assert.match(report.stripeCliHint, /stripe listen/);
});
