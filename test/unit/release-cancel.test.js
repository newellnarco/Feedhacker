"use strict";
// The Chrome Web Store accepts ONE pending version at a time, so a release cut while the
// previous one is still in review fails with ITEM_NOT_UPDATABLE and the fix never reaches
// users. The Release workflow's `webstore` job now withdraws a pending submission first
// (CWS API v2 `cancelSubmission` — the API equivalent of the dashboard's "Cancel review").
//
// This step runs against the maintainer's real store credentials on a real release, and it
// cannot be exercised end-to-end from CI, so it is pinned two ways:
//   1. STRUCTURE — it is ordered before the upload, guarded, and non-fatal;
//   2. BEHAVIOUR — the actual shell is extracted from the YAML and executed against a stub
//      `curl`, so a logic bug (a branch that aborts the job, or a leaked token) fails here
//      rather than during a release.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const WF = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "release.yml"), "utf8");

// Minimal targeted extraction — the repo has no YAML dependency and this needs none.
function stepBlock(name) {
  const start = WF.indexOf(`- name: ${name}`);
  assert.ok(start !== -1, `step "${name}" exists`);
  const rest = WF.slice(start + 1);
  const next = rest.indexOf("\n      - name: ");
  return rest.slice(0, next === -1 ? undefined : next);
}
const cancel = stepBlock("Cancel a pending Chrome Web Store submission");
const runScript = cancel.slice(cancel.indexOf("run: |") + "run: |".length);

// --- structure -----------------------------------------------------------------------
test("the cancel step runs BEFORE the upload", () => {
  const c = WF.indexOf("- name: Cancel a pending Chrome Web Store submission");
  const u = WF.indexOf("- name: Upload to the Chrome Web Store");
  assert.ok(c !== -1 && u !== -1 && c < u, "freeing the slot is pointless after the upload");
});

test("the cancel step can never fail the release", () => {
  assert.match(cancel, /continue-on-error:\s*true/, "a failed cancel must not abort the job");
  assert.match(runScript, /exit 0\s*$/, "…and the script itself exits clean");
  // Matches -e in any combined form (`set -e`, `set -eu`, `set -euo pipefail`) — the first
  // version of this assertion used `set -e\b`, which a later `set -euo` would have slipped past.
  assert.ok(!/^\s*set -[a-z]*e/m.test(runScript), "no `set -e`: every failure here is tolerable");
});

test("a missing publisher id is ANNOUNCED, never silently skipped", () => {
  // FH-048: this used to be an `if:` guard on the step, so an id in the wrong settings tab
  // produced a SKIPPED step and a fully green release that had quietly done nothing. The v0.4.8
  // release hit exactly that. The step now runs whenever store publishing is configured and
  // reports the misconfiguration itself.
  assert.match(cancel, /if:\s*env\.CWS_CLIENT_ID != ''\s*$/m,
    "gated only on store publishing being configured at all");
  assert.ok(!/CWS_PUBLISHER_ID != ''/.test(cancel), "the publisher id is NOT an `if:` guard any more");
  assert.match(runScript, /::warning title=Store cancel disabled::/, "it emits a visible warning annotation");
});

test("the publisher id is accepted from either settings tab", () => {
  // Secrets and Variables sit next to each other in Settings; putting it in the "wrong" one
  // should not silently disable the feature.
  assert.match(WF, /CWS_PUBLISHER_ID:\s*\$\{\{\s*vars\.CWS_PUBLISHER_ID\s*\|\|\s*secrets\.CWS_PUBLISHER_ID\s*\}\}/,
    "falls back from vars to secrets");
});

test("it calls the documented cancelSubmission endpoint", () => {
  assert.match(runScript, /https:\/\/chromewebstore\.googleapis\.com\/v2\/publishers\/\$CWS_PUBLISHER_ID\/items\/\$EXTENSION_ID:cancelSubmission/,
    "CWS API v2 publishers.items.cancelSubmission");
  assert.match(runScript, /-X POST/, "cancelSubmission is a POST");
  assert.match(runScript, /Authorization: Bearer \$tok/, "bearer-token auth");
});

test("the access token is never written to the log", () => {
  // -o sends the body to a file and -w prints only the status code, so no response echo
  // can carry the token, and the token itself is only ever interpolated into a header.
  assert.match(runScript, /-o \/tmp\/cws-cancel\.out -w '%\{http_code\}'/, "body to a file, code to stdout");
  assert.ok(!/echo[^\n]*\$tok/.test(runScript), "the token is never echoed");
});

// --- behaviour: run the real script against a stub curl --------------------------------
function runCancel(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-cancel-"));
  try {
    fs.writeFileSync(path.join(dir, "cancel.sh"), runScript);
    fs.writeFileSync(path.join(dir, "curl"), `#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"oauth2.googleapis.com/token"* ]]; then printf '%s' "$FAKE_TOKEN_JSON"; exit 0; fi
if [[ "$args" == *"cancelSubmission"* ]]; then
  out=""; prev=""; for a in "$@"; do [[ "$prev" == "-o" ]] && out="$a"; prev="$a"; done
  [[ -n "$out" ]] && printf '%s' "$FAKE_CANCEL_BODY" > "$out"
  printf '%s' "$FAKE_CANCEL_CODE"; exit 0
fi
exit 1
`);
    fs.chmodSync(path.join(dir, "curl"), 0o755);
    const out = execFileSync("bash", ["cancel.sh"], {
      cwd: dir,
      encoding: "utf8",
      env: Object.assign({}, process.env, {
        PATH: `${dir}:${process.env.PATH}`,
        CWS_CLIENT_ID: "id", CWS_CLIENT_SECRET: "sec", CWS_REFRESH_TOKEN: "rt",
        CWS_PUBLISHER_ID: "pub123", EXTENSION_ID: "kccajfoghkplakndamlohpepopdpelkb",
        FAKE_TOKEN_JSON: '{"access_token":"ya29.SECRET-TOKEN"}',
        FAKE_CANCEL_CODE: "200", FAKE_CANCEL_BODY: "{}",
      }, env),
    });
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a pending submission is reported as cancelled", () => {
  const out = runCancel({ FAKE_CANCEL_CODE: "200" });
  assert.match(out, /Cancelled the pending submission/);
  assert.ok(!out.includes("SECRET-TOKEN"), "the token never reaches the log");
});

test("nothing pending is normal, not a failure", () => {
  // The API is called blind — there is no cheap way to ask first — so a 4xx is the
  // EXPECTED result on most releases and must read as routine.
  const out = runCancel({ FAKE_CANCEL_CODE: "400", FAKE_CANCEL_BODY: '{"error":{"message":"No active submission"}}' });
  assert.match(out, /No pending submission cancelled \(HTTP 400\)/);
  assert.match(out, /normal when nothing is in review/);
});

test("an auth failure skips the cancel instead of breaking the release", () => {
  const out = runCancel({ FAKE_TOKEN_JSON: '{"error":"invalid_grant"}' });
  assert.match(out, /Could not mint an access token/);
});

test("no publisher id: warns loudly, exits clean, and does not call the API", () => {
  const out = runCancel({ CWS_PUBLISHER_ID: "" });
  assert.match(out, /::warning title=Store cancel disabled::/, "the release log says the cancel did not happen");
  assert.match(out, /ITEM_NOT_UPDATABLE/, "…and names the symptom it would cause");
  assert.ok(!/Cancelled the pending submission/.test(out), "it must not claim to have cancelled anything");
});

test("a malformed token response is handled quietly", () => {
  // It used to spill a Python traceback into the release log, which reads like a crash.
  const out = runCancel({ FAKE_TOKEN_JSON: "not json at all" });
  assert.match(out, /Could not mint an access token/);
  assert.ok(!/Traceback/.test(out), "no stack trace in the release log");
});
