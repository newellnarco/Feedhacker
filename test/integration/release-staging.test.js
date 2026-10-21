"use strict";
// Integration: the exact command release.yml runs (`node scripts/stage-release.mjs --check staged`) reads a staged
// checkout, joins split parts, and exits non-zero on a commit or hash mismatch, so nothing unchecked is published.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "..", "scripts", "stage-release.mjs");

async function makeStaged(dir, version, commit) {
  const lib = await import(pathToFileURL(SCRIPT).href);
  const files = lib.assetNames(version).map((name) => ({ name, buf: Buffer.from(`bytes of ${name}`) }));
  const m = lib.buildManifest({ version, commit, files });
  // Split the first asset by hand into two parts, the way a >90 MB file would be staged.
  const first = m.files[0];
  first.parts = [`${first.name}.part00`, `${first.name}.part01`];
  fs.writeFileSync(path.join(dir, first.parts[0]), files[0].buf.subarray(0, 4));
  fs.writeFileSync(path.join(dir, first.parts[1]), files[0].buf.subarray(4));
  for (const f of files.slice(1)) fs.writeFileSync(path.join(dir, f.name), f.buf);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m));
  return files;
}

const run = (dir, env) => spawnSync(process.execPath, [SCRIPT, "--check", dir], { env: { ...process.env, ...env }, encoding: "utf8" });

test("--check passes a matching set and writes the joined asset", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-staged-"));
  const files = await makeStaged(dir, "9.9.9", "c0ffee");
  const r = run(dir, { VERSION: "9.9.9", GITHUB_SHA: "c0ffee" });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(fs.readFileSync(path.join(dir, files[0].name)), files[0].buf);
});

test("--check exits non-zero for another commit, a tampered file, or missing env", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-staged-"));
  const files = await makeStaged(dir, "9.9.9", "c0ffee");
  assert.notStrictEqual(run(dir, { VERSION: "9.9.9", GITHUB_SHA: "beef" }).status, 0);
  assert.notStrictEqual(run(dir, { VERSION: "", GITHUB_SHA: "" }).status, 0);
  fs.writeFileSync(path.join(dir, files[1].name), "tampered");
  const r = run(dir, { VERSION: "9.9.9", GITHUB_SHA: "c0ffee" });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /sha256|says/);
});
