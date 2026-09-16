"use strict";
// The Release workflow has TWO publish destinations and they are not interchangeable.
//
//   * the `release` job cuts a GitHub Release — a zip someone chooses to download;
//   * the `webstore` job uploads to the Chrome Web Store, which (CWS_AUTO_PUBLISH=true)
//     submits for review and, once Google approves, pushes the new version to EVERY existing
//     store install automatically. Nobody opts in.
//
// Until 0.8.0 both jobs carried the same `if:`, so `publish: true` meant "do both" and there
// was no way to cut a GitHub-only release short of editing the workflow. That matters whenever
// something store-side isn't ready — stale screenshots, a listing edit, a version still in
// review — or when a build is deliberately a limited test before it reaches everyone.
//
// These cases EVALUATE the two gates rather than grepping them, under the four situations that
// actually occur, so a future edit that re-couples them fails here instead of on a release.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const WF = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "release.yml"), "utf8");

// --- extract a job's gate ---------------------------------------------------------------
// Jobs sit at two-space indent; a job's `if:` is the first one inside it. Deliberately
// targeted string work — the repo carries no YAML dependency and this needs none.
function jobGate(job) {
  const start = WF.indexOf(`\n  ${job}:\n`);
  assert.ok(start !== -1, `job "${job}" exists`);
  const rest = WF.slice(start + 1);
  const nextJob = rest.slice(1).search(/\n {2}\w[\w-]*:\n/);
  const block = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
  const m = block.match(/^ {4}if:\s*(.+)$/m);
  assert.ok(m, `job "${job}" has an \`if:\` gate`);
  return m[1].trim();
}

// --- evaluate it ------------------------------------------------------------------------
// A GitHub expression is not JavaScript, so translating one is only safe for the handful of
// constructs these gates use. Anything outside that set is REJECTED rather than guessed at:
// silently mis-evaluating a gate would make this suite green while the real workflow did the
// opposite, which is the whole failure mode the file exists to prevent.
const ALLOWED = /^[\s\w.'/&|()=,-]+$/; // no !, no unsupported function calls, no ternaries
function evaluateGate(expr, ctx) {
  const inner = expr.replace(/^\$\{\{/, "").replace(/\}\}$/, "").trim();
  assert.match(inner, ALLOWED, "gate uses only the expression subset this evaluator models");
  const calls = inner.match(/[A-Za-z_]\w*\(/g) || [];
  for (const c of calls) {
    assert.strictEqual(c, "startsWith(", `unmodelled function ${c}) — teach this test before using it`);
  }
  const js = inner
    .replace(/startsWith\(\s*([\w.]+)\s*,\s*'([^']*)'\s*\)/g, "String($1 == null ? '' : $1).startsWith('$2')")
    .replace(/\bgithub\.(\w+)/g, "(ctx.github.$1)")
    .replace(/\binputs\.(\w+)/g, "(ctx.inputs.$1)")
    .replace(/==/g, "===");
  // eslint-disable-next-line no-new-func
  return !!new Function("ctx", `return (${js});`)({ github: ctx.github, inputs: ctx.inputs || {} });
}

const release = jobGate("release");
const webstore = jobGate("webstore");

// A tag push carries NO inputs at all — `inputs.store` is undefined there, not true. Modelling
// that faithfully is the point: a gate written `inputs.store` alone would pass a hand-written
// "is the word there" check and then skip the store on every tagged release.
const TAG_PUSH = { github: { ref: "refs/tags/v0.8.0", event_name: "push" }, inputs: {} };
const dispatch = (o) => ({
  github: { ref: "refs/heads/main", event_name: "workflow_dispatch" },
  inputs: Object.assign({ publish: false, store: true }, o),
});

test("GitHub-only release: publish on, store off", () => {
  const ctx = dispatch({ publish: true, store: false });
  assert.strictEqual(evaluateGate(release, ctx), true, "the GitHub Release is still cut");
  assert.strictEqual(evaluateGate(webstore, ctx), false,
    "…and nothing is pushed to the store, where it would auto-update every existing install");
});

test("the ordinary manual release still does both", () => {
  const ctx = dispatch({ publish: true, store: true });
  assert.strictEqual(evaluateGate(release, ctx), true);
  assert.strictEqual(evaluateGate(webstore, ctx), true, "`store` defaults on — this is not an opt-in");
});

test("a tag push publishes to both, exactly as before the switch existed", () => {
  // The regression that matters most: `inputs` is empty on a push, so a gate that requires
  // `inputs.store` to be truthy without the tag branch would silently stop shipping to users.
  assert.strictEqual(evaluateGate(release, TAG_PUSH), true);
  assert.strictEqual(evaluateGate(webstore, TAG_PUSH), true);
});

test("a dry run publishes nowhere", () => {
  const ctx = dispatch({ publish: false, store: true });
  assert.strictEqual(evaluateGate(release, ctx), false, "no release from a build-only run");
  assert.strictEqual(evaluateGate(webstore, ctx), false, "and certainly no store upload");
});

test("`store` is a declared boolean input that defaults ON", () => {
  // Default-on keeps every existing habit working; someone who dispatches the workflow the way
  // they always have gets the release they always got.
  const m = WF.match(/^ {6}store:\n((?: {8}.+\n)+)/m);
  assert.ok(m, "the workflow declares a `store` input");
  assert.match(m[1], /type:\s*boolean/, "boolean, so the UI renders a checkbox");
  assert.match(m[1], /default:\s*true/, "defaulting to true");
});

test("the store upload can never be reached without `publish`", () => {
  // `store` alone must not publish: it narrows the existing switch, it does not add a new one.
  assert.strictEqual(evaluateGate(webstore, dispatch({ publish: false, store: true })), false);
});
