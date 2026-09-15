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
  // The API is called blind — there is no cheap way to ask first — so 400/404 is the
  // EXPECTED result on most releases and must read as routine.
  const out = runCancel({ FAKE_CANCEL_CODE: "400", FAKE_CANCEL_BODY: '{"error":{"message":"No active submission"}}' });
  assert.match(out, /No pending submission cancelled \(HTTP 400\)/);
  assert.match(out, /nothing was in review/);
  assert.ok(!out.includes("::warning"), "a routine empty queue must not cry wolf");
});

test("a 404 also reads as an empty queue", () => {
  const out = runCancel({ FAKE_CANCEL_CODE: "404", FAKE_CANCEL_BODY: '{"error":{"message":"Not found"}}' });
  assert.match(out, /No pending submission cancelled \(HTTP 404\)/);
  assert.ok(!out.includes("::warning"));
});

// --- FH-055: a refusal must never be reported as an empty queue ------------------------------
//
// This shipped twice. On v0.6.0 and again on v0.7.0 cancelSubmission returned
// 403 PERMISSION_DENIED and the step printed "This is normal when nothing is in review" — the
// exact false-green class §4 exists to prevent, and the one FH-048 fixed in the *empty id*
// branch while leaving it alive in this one. A 403 means the request never got far enough to
// learn whether anything was pending, so the slot state is UNKNOWN, not empty.

test("a 403 is reported as a REFUSAL, never as 'nothing in review' (FH-055)", () => {
  const out = runCancel({
    FAKE_CANCEL_CODE: "403",
    FAKE_CANCEL_BODY: '{"error":{"code":403,"status":"PERMISSION_DENIED","message":"Permission denied on resource"}}',
  });
  assert.match(out, /::warning title=Store cancel REFUSED::/, "it must warn, not reassure");
  assert.match(out, /REFUSED \(HTTP 403\)/);
  assert.ok(!/nothing was in review/.test(out),
    "the empty-queue wording must NOT appear for a refusal — that is the bug");
  assert.match(out, /ITEM_NOT_UPDATABLE/, "…and it names the symptom this would cause");
  assert.match(out, /PERMISSION_DENIED/, "the real API error body is surfaced, not swallowed");
});

test("a 403 names the misconfigured id so the reader can fix it (FH-055)", () => {
  const out = runCancel({ FAKE_CANCEL_CODE: "403", CWS_PUBLISHER_ID: "project-46303a79-fd20-4ed8-859" });
  assert.match(out, /project-46303a79-fd20-4ed8-859/, "the offending value is echoed");
  assert.match(out, /Google Cloud project id/, "…and the log says why that shape is wrong");
  assert.match(out, /Dashboard -> Publisher > Settings/, "…and where the right one lives");
});

test("a 401 is treated as a refusal too", () => {
  const out = runCancel({ FAKE_CANCEL_CODE: "401" });
  assert.match(out, /::warning title=Store cancel REFUSED::/);
  assert.ok(!/nothing was in review/.test(out));
});

test("an unexpected status admits the slot state is unknown", () => {
  const out = runCancel({ FAKE_CANCEL_CODE: "500", FAKE_CANCEL_BODY: '{"error":"boom"}' });
  assert.match(out, /::warning title=Store cancel failed::/);
  assert.match(out, /UNKNOWN/);
  assert.ok(!/nothing was in review/.test(out), "a 500 is not an empty queue either");
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
