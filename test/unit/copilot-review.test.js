"use strict";
// Unit: the Copilot review lane (.github/workflows/copilot-review.yml) — the only thing that asks Copilot.
//
// Why this file exists. On 2026-10-11 the owner turned GitHub's AUTOMATIC Copilot review off on the
// account, after Copilot's monthly quota ran out fleet-wide (from 2026-10-04 every request came back as a
// "reached their quota limit" review). Muther (newellnarco/AlienInterface) now holds the one switch: the
// Actions variable COPILOT_REVIEW. Exactly "on" means Copilot may be asked; "off until YYYY-MM-DD (reason)"
// is a hard off; unset means nobody has said, so nothing asks. This workflow is that rule in code, copied
// from AlienInterface's lane (AlienInterface#207, netsniff#448).
//
// The cases below RUN the workflow's own script under stubs rather than grepping it: a grep cannot tell
// `sw !== 'on'` from `!sw`, and the second asks Copilot on "off until 2026-11-01" — exactly the request
// the switch exists to stop.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const WF = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "copilot-review.yml"), "utf8");
const REFUSAL =
  "Copilot was unable to review this pull request because the user who requested the review has reached their quota limit.";

// The `script: |` block, de-indented, as github-script would run it.
function scriptBody() {
  const lines = WF.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+script: \|\s*$/.test(l));
  assert.ok(at !== -1, "copilot-review.yml has a `script: |` block");
  const indent = lines[at + 1].match(/^\s*/)[0].length;
  const body = [];
  for (const l of lines.slice(at + 1)) {
    if (l.trim() && l.match(/^\s*/)[0].length < indent) break;
    body.push(l.slice(indent));
  }
  return body.join("\n");
}

// Run the lane with COPILOT_REVIEW = env (undefined = unset) and these recent Copilot reviews.
async function runLane(env, reviews, { gqlThrows = false } = {}) {
  const calls = { requested: 0, graphql: 0, notices: [], warnings: [], headings: [], raw: [] };
  const summary = {
    addHeading: (h) => (calls.headings.push(h), summary),
    addRaw: (r) => (calls.raw.push(r), summary),
    write: async () => undefined,
  };
  const github = {
    graphql: async () => {
      calls.graphql++;
      if (gqlThrows) throw new Error("boom");
      return { search: { nodes: [{ reviews: { nodes: reviews } }] } };
    },
    rest: {
      pulls: {
        requestReviewers: async () => (calls.requested++, {}),
        listRequestedReviewers: async () => ({ data: { users: [{ login: "Copilot" }] } }),
      },
    },
  };
  const core = { notice: (m) => calls.notices.push(m), warning: (m) => calls.warnings.push(m), summary };
  const context = { payload: { pull_request: { number: 7 } }, repo: { owner: "o", repo: "r" } };
  const saved = process.env.COPILOT_REVIEW;
  if (env === undefined) delete process.env.COPILOT_REVIEW;
  else process.env.COPILOT_REVIEW = env;
  try {
    await new Function("github", "core", "context", "process", `return (async () => {\n${scriptBody()}\n})();`)(
      github, core, context, process,
    );
  } finally {
    if (saved === undefined) delete process.env.COPILOT_REVIEW;
    else process.env.COPILOT_REVIEW = saved;
  }
  return calls;
}

test("the switch is passed in from Muther's Actions variable", () => {
  assert.match(WF, /^\s+COPILOT_REVIEW: \$\{\{ vars\.COPILOT_REVIEW \}\}\s*$/m);
});

test("the switch is read FIRST: before the quota look-up, before Copilot is asked", () => {
  const body = scriptBody();
  const sw = body.indexOf("process.env.COPILOT_REVIEW");
  const gate = body.indexOf("if (sw !== 'on')");
  const look = body.indexOf("github.graphql(");
  const ask = body.indexOf("requestReviewers(");
  assert.ok(sw !== -1 && gate !== -1 && look !== -1 && ask !== -1, "all four steps are present");
  assert.ok(sw < gate && gate < look && look < ask, "switch → gate → quota look-up → ask, in that order");
});

test('off is a hard off: nothing asks, nothing even looks, and the run says "skipped: Copilot quota"', async () => {
  const off = await runLane("off until 2026-11-01 (quota refusal)", []);
  assert.equal(off.requested, 0, "Copilot is not asked");
  assert.equal(off.graphql, 0, "the skip returns before the quota look-up");
  assert.match(off.notices[0], /^skipped: Copilot quota \(Muther's COPILOT_REVIEW is "off until 2026-11-01 \(quota refusal\)"\)/);
  assert.match(off.headings[0], /skipped: Copilot quota/);
  assert.match(off.raw.join("\n"), /coverage gap/, "the summary calls the skip a coverage gap, not a review");
});

test("unset asks nothing, and says the switch is not set", async () => {
  const unset = await runLane(undefined, []);
  assert.equal(unset.requested, 0);
  assert.equal(unset.graphql, 0);
  assert.match(unset.notices[0], /COPILOT_REVIEW switch is not set/);
});

test('only EXACTLY "on" asks — near misses are offs', async () => {
  for (const near of ["On", "ON", "true", "yes", "1", "on until 2026-11-01", "off"]) {
    const r = await runLane(near, []);
    assert.equal(r.requested, 0, `"${near}" must not ask`);
    assert.match(r.notices[0], /^skipped: Copilot quota/, `"${near}" says why`);
  }
  const on = await runLane("on", [{ submittedAt: "2020-01-01T00:00:00Z", body: "## overview" }]);
  assert.equal(on.requested, 1, '"on" with no refusal on record: asked once');
  const padded = await runLane("  on\n", []);
  assert.equal(padded.requested, 1, "surrounding whitespace in the variable is trimmed");
});

test("with the switch on, this month's quota refusal still stops it (the switch may lag)", async () => {
  const refused = await runLane("on", [{ submittedAt: new Date().toISOString(), body: REFUSAL }]);
  assert.equal(refused.requested, 0);
  assert.match(refused.notices[0], /^skipped: Copilot quota \(until \d{4}-\d{2}-01\)/);
  const lastMonth = await runLane("on", [{ submittedAt: "2020-01-15T00:00:00Z", body: REFUSAL }]);
  assert.equal(lastMonth.requested, 1, "an old refusal does not hold");
  const blind = await runLane("on", [], { gqlThrows: true });
  assert.equal(blind.requested, 1, "on, but the refusal check could not look: asks, and warns");
  assert.match(blind.warnings[0], /could not look/);
});

test("public repo: GitHub-hosted runner only, GITHUB_TOKEN only, never drafts or docs-only", () => {
  // FeedHacker is public; fleet Actions rule 7 keeps a stranger's PR off Muther's self-hosted runners.
  const runsOn = WF.match(/^\s+runs-on:.*$/gm) || [];
  assert.equal(runsOn.length, 1, "one job, one runs-on");
  assert.match(runsOn[0], /^\s+runs-on: ubuntu-latest(\s+#.*)?$/, "no runner expression that could pick self-hosted");
  assert.doesNotMatch(WF, /secrets\./, "no secret beyond the default GITHUB_TOKEN");
  assert.doesNotMatch(WF, /actions\/checkout/, "no checkout: the lane never runs PR code");
  assert.match(WF, /types: \[opened, reopened, ready_for_review\]/);
  assert.match(WF, /if: \$\{\{ !github\.event\.pull_request\.draft \}\}/);
  assert.match(WF, /paths-ignore:\s*\n\s+- 'docs\/\*\*'\s*\n\s+- '\*\*\/\*\.md'/);
  assert.match(WF, /reviewers: \['copilot-pull-request-reviewer\[bot\]'\]/);
});
