"use strict";
// Unit: release assets are built in the Claude session VM and only published by release.yml (owner, 2026-10-21:
// "no builds on the pc for any repo", "no js bundles on the pc either. just build in claude's vm").
// The staging manifest's checks are evaluated on real buffers; the workflow is pinned to build nothing.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { readText } = require("../text");

const ROOT = path.join(__dirname, "..", "..");
const WF = readText(path.join(ROOT, ".github", "workflows", "release.yml"));
// The workflow without its comments, so a comment naming a build script is not read as running it.
const CODE = WF.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const load = () => import(path.join(ROOT, "scripts", "stage-release.mjs"));

function staged(lib, version = "1.2.3", commit = "abc") {
  const files = lib.assetNames(version).map((name, i) => ({ name, buf: Buffer.from(`asset ${i} ${name}`) }));
  const manifest = lib.buildManifest({ version, commit, files, built: "x" });
  const store = new Map(files.map((f) => [f.name, f.buf]));
  return { files, manifest, store, read: (n) => store.get(n) || null };
}

test("a matching staged set passes and comes back intact", async () => {
  const lib = await load();
  const s = staged(lib);
  const r = lib.checkStaged(s.manifest, { version: "1.2.3", commit: "abc" }, s.read);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.files.map((f) => f.buf.toString()), s.files.map((f) => f.buf.toString()));
});

test("another commit, another version, a changed byte or a missing asset is refused", async () => {
  const lib = await load();
  let s = staged(lib);
  assert.match(lib.checkStaged(s.manifest, { version: "1.2.3", commit: "def" }, s.read).errors.join(), /built from abc/);
  assert.match(lib.checkStaged(s.manifest, { version: "1.2.4", commit: "abc" }, s.read).errors.join(), /are 1\.2\.3/);
  s.store.set("feedhacker-1.2.3.zip", Buffer.from("asset 0 feedhacker-1.2.3.ziX"));
  assert.match(lib.checkStaged(s.manifest, { version: "1.2.3", commit: "abc" }, s.read).errors.join(), /sha256/);
  s = staged(lib);
  s.manifest.files = s.manifest.files.filter((f) => !f.name.endsWith("-store.zip"));
  assert.match(lib.checkStaged(s.manifest, { version: "1.2.3", commit: "abc" }, s.read).errors.join(), /-store\.zip is not staged/);
  assert.ok(lib.checkStaged(null, { version: "1.2.3", commit: "abc" }, s.read).errors.length > 0, "no manifest is never a pass");
});

test("large files split into 90 MB parts and join back", async () => {
  const lib = await load();
  assert.deepStrictEqual(lib.partNames("a.zip", 10), ["a.zip"]);
  assert.deepStrictEqual(lib.partNames("a.zip", lib.PART_BYTES + 1), ["a.zip.part00", "a.zip.part01"]);
  const name = "feedhacker-1.2.3.zip";
  const m = { version: "1.2.3", commit: "c", files: [{ name, size: 6, sha256: lib.sha256(Buffer.from("abcdef")), parts: ["p0", "p1"] }] };
  const parts = { p0: Buffer.from("abc"), p1: Buffer.from("def") };
  const r = lib.checkStaged(m, { version: "1.2.3", commit: "c" }, (n) => parts[n] || null);
  assert.strictEqual(r.files[0].buf.toString(), "abcdef");
  assert.match(r.errors.join(), /not staged/, "the other three assets are still required");
});

test("release.yml builds nothing: no npm build, no node build script, no npm ci", () => {
  assert.ok(!/npm (ci|install|run build)\b/.test(CODE), "no npm install or build in release.yml");
  assert.ok(!/scripts\/build(-release-vm)?\.mjs/.test(CODE), "the build scripts are never run here");
  assert.ok(!/\n {2}build:\n/.test(WF), "the old build job is gone");
  assert.match(WF, /node scripts\/stage-release\.mjs --check staged/, "the staged assets are checked");
  assert.match(WF, /git fetch --depth 1 origin installers/);
});

test("every publishing job consumes the checked staged assets", () => {
  assert.match(WF, /\n {2}msi:\n {4}needs: staged\n/);
  assert.match(WF, /needs: \[staged, msi\]/);
  assert.match(WF, /\n {2}webstore:\n {4}needs: staged\n/);
  const job = WF.slice(WF.indexOf("\n  staged:\n"), WF.indexOf("\n  msi:\n"));
  assert.match(job, /runs-on: ubuntu-latest/);
  assert.match(job, /# HOSTED ONLY/);
});
