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
// `concurrency` is keyed on the BRANCH NAME (plus the repository): a push run and a pull_request
// run for the same branch share a group, so the later cancels the earlier and exactly one
// survives. FH-071 keyed it on the head commit, which deduplicated the two triggers but let every
// superseded commit keep its own run; on the owner's single PC runner those piled up (FH-078).
// The cases below EVALUATE the expression under each event shape instead of grepping it — a grep
// cannot tell `github.ref` (which differs between a push and a PR) from `github.ref_name` /
// `github.head_ref` (which agree), and the wrong one runs everything twice (§59).
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { readText } = require("../text");

const WF = readText(path.join(__dirname, "..", "..", ".github", "workflows", "ci.yml"));

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

// Only the constructs this expression uses are modelled: dotted context lookups and `||` as a
// coalescing operator, inside one or more `${{ }}` blocks. Anything else is rejected rather than
// guessed at, because an evaluator that quietly mis-reads the group would make this file green
// while the workflow ran the triad twice — or, worse, cancelled a run it should have kept.
function evalGroup(expr, ctx) {
  return expr.replace(/\$\{\{([^}]*)\}\}/g, (_, inner) => {
    const terms = inner.trim().split("||").map((t) => t.trim());
    for (const t of terms) {
      assert.match(t, /^[A-Za-z_][\w.]*$/, `unmodelled term \`${t}\` — teach this test before using it`);
      const v = t.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "";
  });
}

const groupExpr = (() => {
  const m = CONCURRENCY.match(/^ {2}group:\s*(.+)$/m);
  assert.ok(m, "concurrency declares a `group:`");
  return m[1].trim();
})();

const REPO = "newellnarco/Feedhacker";
const BRANCH = "claude/determined-thompson-bjujrt";
// Event payload shapes as GitHub sends them. On a pull_request event `github.ref` is
// `refs/pull/N/merge` and `github.sha` the merge commit; `head_ref` is the PR's branch name. On a
// push `head_ref` is empty and `ref_name` is the branch.
const push = (branch, sha, repo = REPO) => ({
  github: { repository: repo, sha, ref: `refs/heads/${branch}`, ref_name: branch, head_ref: "", event: {} },
});
const pr = (n, branch, sha, headRepo = REPO) => ({
  github: { repository: REPO, sha: "9".repeat(40), ref: `refs/pull/${n}/merge`, ref_name: `${n}/merge`, head_ref: branch,
    event: { pull_request: { number: n, head: { sha, ref: branch, repo: { full_name: headRepo } } } } },
});
const g = (ctx) => evalGroup(groupExpr, ctx);

test("a push run and a PR run for the same commit land in ONE group", () => {
  // The two-trigger design (FH-071). If these differ, every PR runs the triad twice.
  assert.strictEqual(g(push(BRANCH, "a".repeat(40))), g(pr(113, BRANCH, "a".repeat(40))));
});

test("a newer commit on the same branch supersedes the older one (FH-078)", () => {
  // The pile-up: keyed on the commit, an older head kept its run after a newer push landed.
  assert.strictEqual(g(push(BRANCH, "1".repeat(40))), g(push(BRANCH, "2".repeat(40))), "two pushes to one branch");
  assert.strictEqual(g(pr(113, BRANCH, "1".repeat(40))), g(pr(113, BRANCH, "2".repeat(40))), "two heads of one PR");
  assert.strictEqual(g(push("main", "1".repeat(40))), g(push("main", "2".repeat(40))), "two merges to main");
});

test("different branches never cancel each other", () => {
  assert.notStrictEqual(g(push(BRANCH, "a".repeat(40))), g(push("claude/other-branch", "a".repeat(40))));
  assert.notStrictEqual(g(push("main", "a".repeat(40))), g(push(BRANCH, "a".repeat(40))), "a branch push never cancels main");
});

test("a fork's PR cannot cancel this repository's run on a same-named branch", () => {
  assert.notStrictEqual(g(pr(200, "main", "b".repeat(40), "stranger/Feedhacker")), g(push("main", "b".repeat(40))));
});

test("the group is keyed on the branch name, never on `github.ref` or a commit sha", () => {
  // `github.ref` differs between a push (refs/heads/x) and a PR (refs/pull/N/merge), so keying
  // on it runs both; a sha key is the FH-078 pile-up.
  assert.ok(!/github\.ref\b(?!_name)/.test(groupExpr), "`github.ref` splits the push and PR runs of one branch");
  assert.ok(!/\bsha\b/.test(groupExpr), "a commit key lets superseded commits keep their runs (FH-078)");
  assert.match(groupExpr, /github\.head_ref/, "the PR side must use the PR's branch name");
  assert.match(groupExpr, /github\.ref_name/, "the push side must use the pushed branch name");
});

test("the surviving run is the newer one", () => {
  assert.match(CONCURRENCY, /cancel-in-progress:\s*true/,
    "without this the runs queue instead of collapsing");
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
