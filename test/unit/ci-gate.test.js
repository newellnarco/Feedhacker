"use strict";
// Unit: the CI workflow's TRIGGERS and its deduplication — the merge gate's own plumbing.
//
// Why this file exists. Until 2026-09-18 CI ran on `pull_request` plus `push` to `main` only, so
// every pre-merge run came from one event. That day GitHub stopped creating `pull_request` runs
// for this repo: four pushes to one branch produced a CodeQL run each and no CI run at all, while
// `push` to main (run 426) and `workflow_dispatch` both kept working, `list_workflows` reported
// the workflow `active`, and `ci.yml` had not been touched since PR #46. The cause is on GitHub's
// side and Settings → Actions is not reachable from a session, so the fix is not a root-cause fix:
// it removes the single point of failure. 0.11.0 had to be merged with NO CI on the maintainer's
// explicit authorisation (FH-071) — that is what a one-trigger gate costs.
//
// Two triggers only help if a duplicate run does not cost the triad twice, which is why
// `concurrency` is keyed on the HEAD COMMIT rather than the ref: a push run and a pull_request run
// for the same commit share a group, so the later cancels the earlier and exactly one survives.
// The cases below EVALUATE that expression under both event shapes instead of grepping it — a
// grep cannot tell `github.ref` from `github.sha`, and keying on the ref is precisely the version
// that runs everything twice (§59).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const WF = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "ci.yml"), "utf8");

// --- the `on:` block -------------------------------------------------------------------
// Top-level keys sit at column 0; the block runs to the next one.
function topBlock(key) {
  const start = WF.indexOf(`\n${key}:\n`);
  assert.ok(start !== -1, `ci.yml has a top-level \`${key}:\``);
  const rest = WF.slice(start + 1);
  const next = rest.slice(1).search(/\n\S/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}
const ON = topBlock("on");

test("the pull_request trigger is still declared", () => {
  // Kept, not replaced. It is the trigger GitHub is meant to fire, it is the only one that runs
  // against the PR's merge commit, and the branch push is a fallback for the day it goes quiet.
  assert.match(ON, /^ {2}pull_request:?\s*$/m,
    "`pull_request:` must stay — the branch push is a second path to a run, not a substitute");
});

test("a push to a claude/** branch also triggers CI", () => {
  // The actual fix. Every development branch in this repo is `claude/<something>`, so this is
  // what makes a run appear for a PR head even when the PR event never fires.
  const m = ON.match(/^ {2}push:\n((?: {4}.+\n)+)/m);
  assert.ok(m, "`push:` is declared with a branch list");
  assert.match(m[1], /branches:\s*\[[^\]]*\bmain\b/, "main still runs CI");
  assert.match(m[1], /branches:\s*\[[^\]]*claude\/\*\*/,
    'the development branch glob `claude/**` must be in the push branch list — without it the ' +
    "gate rests on `pull_request` alone, which is how FH-071 happened");
});

// --- the deduplication ------------------------------------------------------------------
const CONCURRENCY = topBlock("concurrency");

// Only the two constructs this expression uses are modelled: dotted context lookups and `||`
// as a coalescing operator. Anything else is rejected rather than guessed at, because an
// evaluator that quietly mis-reads the group would make this file green while the workflow ran
// the triad twice — or, worse, cancelled a run it should have kept.
function evalGroup(expr, ctx) {
  const parts = [];
  const literal = expr.replace(/\$\{\{([^}]*)\}\}/g, (_, inner) => {
    parts.push(inner.trim());
    return "\u0000";
  });
  assert.strictEqual(parts.length, 1, "the group is one literal prefix plus one expression");
  const terms = parts[0].split("||").map((t) => t.trim());
  const out = [];
  for (const t of terms) {
    assert.match(t, /^[A-Za-z_][\w.]*$/, `unmodelled term \`${t}\` — teach this test before using it`);
    out.push(t.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx));
  }
  const value = out.find((v) => v !== undefined && v !== null && v !== "");
  return literal.replace("\u0000", value === undefined ? "" : String(value));
}

const groupExpr = (() => {
  const m = CONCURRENCY.match(/^ {2}group:\s*(.+)$/m);
  assert.ok(m, "concurrency declares a `group:`");
  return m[1].trim();
})();

const SHA = "fe15e08f0e4b4b6c5a1f2d3e4a5b6c7d8e9f0a1b";
// A pull_request event: `github.sha` is the MERGE commit, not the branch head, which is exactly
// why the head sha has to be read out of the event payload.
const PR_EVENT = {
  github: { sha: "9999999999999999999999999999999999999999", ref: "refs/pull/113/merge",
    event: { pull_request: { head: { sha: SHA } } } },
};
const PUSH_EVENT = { github: { sha: SHA, ref: "refs/heads/claude/determined-thompson-bjujrt", event: {} } };

test("a push run and a PR run for the same commit land in ONE group", () => {
  // The whole point of the two-trigger design. If these differ, every PR runs the triad twice.
  assert.strictEqual(evalGroup(groupExpr, PUSH_EVENT), evalGroup(groupExpr, PR_EVENT));
});

test("two different commits do NOT share a group", () => {
  // The other half: a group keyed on something commit-independent (the ref, the workflow name)
  // would cancel the run for the commit under review as soon as the next push arrived.
  const older = { github: { sha: "1111111111111111111111111111111111111111", ref: PUSH_EVENT.github.ref, event: {} } };
  assert.notStrictEqual(evalGroup(groupExpr, PUSH_EVENT), evalGroup(groupExpr, older));
});

test("the group is keyed on the commit, not the ref", () => {
  // Stated as its own assertion because `ci-${{ github.ref }}` is the version this replaced and
  // it reads perfectly well: same ref for the push and the PR, so one of the two runs is lost.
  assert.ok(!/github\.ref/.test(groupExpr),
    "keying on the ref makes a branch push cancel its own PR run (or vice versa)");
  assert.match(groupExpr, /github\.sha/, "the push side must resolve to the pushed commit");
  assert.match(groupExpr, /pull_request\.head\.sha/,
    "the PR side must use the HEAD sha — `github.sha` on a PR event is the merge commit");
});

test("the surviving run is the newer one", () => {
  assert.match(CONCURRENCY, /cancel-in-progress:\s*true/,
    "without this the two triggers queue instead of collapsing");
});

// --- the gate still gates ----------------------------------------------------------------
test("all three tiers run, and `package` waits for every one of them", () => {
  // A tier dropped from `needs:` is a green CI with a tier missing — the failure mode the whole
  // three-job layout exists to prevent (TEST_MATRIX: everything built ships the triad).
  for (const job of ["unit", "integration", "system", "package"]) {
    assert.ok(WF.includes(`\n  ${job}:\n`), `the \`${job}\` job exists`);
  }
  const m = WF.match(/^ {4}needs:\s*\[([^\]]*)\]/m);
  assert.ok(m, "`package` declares its `needs:`");
  const needs = m[1].split(",").map((s) => s.trim()).sort();
  assert.deepStrictEqual(needs, ["integration", "system", "unit"],
    "package must depend on all three tiers, so the published build is a green build");
});
