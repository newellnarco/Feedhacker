"use strict";
// System: the real VM build's assets (dist/, after `npm run build`) are exactly the set release.yml publishes, and
// pass the same `--check` release.yml runs once staged with this commit's manifest.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { ROOT } = require("./helper");

const SCRIPT = path.join(ROOT, "scripts", "stage-release.mjs");

test("the built assets stage and pass release.yml's check", async () => {
  const lib = await import(pathToFileURL(SCRIPT).href);
  const version = lib.readVersion(ROOT);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-staged-"));
  const files = lib.assetNames(version).map((name) => {
    const p = path.join(ROOT, "dist", name);
    assert.ok(fs.existsSync(p), `dist/${name} built (run npm run build)`);
    const buf = fs.readFileSync(p);
    fs.writeFileSync(path.join(dir, name), buf);
    return { name, buf };
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(lib.buildManifest({ version, commit: "sys", files })));
  const r = spawnSync(process.execPath, [SCRIPT, "--check", dir], { env: { ...process.env, VERSION: version, GITHUB_SHA: "sys" }, encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr);
});
