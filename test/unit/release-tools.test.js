"use strict";
// Unit: the Release workflow's `release` job brings its own gh and jq on a self-hosted runner.
//
// FH-079. #121 moved `release` onto the owner's PC runner and guarded it with a check that failed
// when gh, jq or git was missing. Release run #33 (0.13.0, 2026-10-12) then stopped there:
// "gh is not installed on this self-hosted runner". The store upload (hosted) had already gone
// out, so the version reached Google with no tag and no GitHub Release. Nothing may be installed
// on the PC with sudo, so the job now fetches a pinned, checksum-verified gh/jq into its temp dir.
// These assertions pin that shape; the step itself was run locally with gh/jq off PATH, with a
// missing gzip, and with a corrupted checksum before it shipped.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { readText } = require("../text");

const WF = readText(path.join(__dirname, "..", "..", ".github", "workflows", "release.yml"));
const job = WF.slice(WF.indexOf("\n  release:\n"), WF.indexOf("\n  webstore:\n"));

function step(name) {
  const i = job.indexOf(`- name: ${name}`);
  assert.ok(i !== -1, `the release job has a "${name}" step`);
  const rest = job.slice(i + 1);
  const next = rest.search(/\n {6}- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

const PROVIDE = step("Provide gh and jq (self-hosted)");

test("a missing gh or jq on a self-hosted runner is provided, not fatal (FH-079)", () => {
  assert.ok(!/for t in gh/.test(job), "the old hard stop on a missing gh is gone");
  assert.match(PROVIDE, /if:\s*runner\.environment != 'github-hosted'/, "hosted runners already have both");
  assert.match(PROVIDE, /command -v gh/);
  assert.match(PROVIDE, /command -v jq/);
  assert.match(PROVIDE, /GITHUB_PATH/, "the tools reach later steps through GITHUB_PATH");
});

test("the provided tools run before the step that publishes", () => {
  assert.ok(job.indexOf("- name: Provide gh and jq (self-hosted)") < job.indexOf("- name: Create GitHub Release with prebuilt assets"));
});

test("downloads are pinned to exact versions and checksum-verified", () => {
  assert.match(PROVIDE, /GH_VERSION:\s*"\d+\.\d+\.\d+"/, "gh is pinned");
  assert.match(PROVIDE, /JQ_VERSION:\s*"\d+\.\d+\.\d+"/, "jq is pinned");
  assert.strictEqual((PROVIDE.match(/sha256sum -c -/g) || []).length, 2, "both downloads are verified");
  assert.match(PROVIDE, /set -euo pipefail/);
});

test("no `a && b` list hides a failed extract from set -e", () => {
  // `tar … && mv …` exits non-zero without tripping `set -e`; found while testing this step.
  assert.ok(!/tar [^\n]*&&/.test(PROVIDE), "tar and mv are separate commands");
});

test("git is still required, never fetched", () => {
  assert.match(PROVIDE, /command -v git >\/dev\/null \|\| \{[^}]*exit 1/);
});
