"use strict";
// Guard the Windows auto-updater's RELEASE-ASSET SELECTION.
//
// Bug this locks: `Sync-LatestRelease` picked its download with a blacklist —
// `feedhacker-*.zip` minus `*-win.zip`. A release carries four zips, GitHub returns assets
// in upload order (alphabetical), so `feedhacker-<v>-store-submission.zip` came first and
// won. That bundle has no manifest.json by design, so the daily scheduled task AND the
// extension's "Update now" (both call this one function) failed on every run. Picking
// `-store.zip` instead would be worse: no sideload `key`, so the unpacked extension ID
// changes and native messaging breaks.
//
// The selection lives in PowerShell, which doesn't run in CI on Linux. So this reads the
// pattern out of lib.ps1 and applies it to the real asset name sets a release produces —
// which is exactly the input that broke. A blacklist-shaped pattern fails here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const LIB = path.join(__dirname, "..", "..", "installer", "windows", "lib.ps1");
const lib = fs.readFileSync(LIB, "utf8");

// Asset names a release actually carries, in GitHub's upload (alphabetical) order — the
// order that exposed the bug. Verified against the real v0.4.5 release.
const assetsFor = (v) => [
  `feedhacker-${v}-store-submission.zip`,
  `feedhacker-${v}-store.zip`,
  `feedhacker-${v}-win.zip`,
  `feedhacker-${v}.zip`,
];

// Pull the -match regex literal out of the asset-selection line.
function selectionRegex() {
  const line = lib.split("\n").find((l) => l.includes("$rel.assets") && l.includes("Where-Object"));
  assert.ok(line, "could not find the asset-selection line in lib.ps1");
  const m = line.match(/-match\s+'([^']+)'/);
  assert.ok(
    m,
    "the updater must select its asset with an anchored -match allowlist, not a -like blacklist " +
      `(found: ${line.trim()})`
  );
  return new RegExp(m[1]);
}

test("the updater selects the sideload zip, never the store or submission bundle", () => {
  const re = selectionRegex();
  for (const v of ["0.4.6", "0.4.5", "1.0.0", "0.10.11"]) {
    const matched = assetsFor(v).filter((n) => re.test(n));
    assert.deepStrictEqual(
      matched,
      [`feedhacker-${v}.zip`],
      `v${v}: the updater must match exactly the sideload zip. -store-submission.zip has no ` +
        `manifest.json, and -store.zip omits the sideload key (extension ID would change).`
    );
  }
});

test("the asset pattern is anchored at both ends", () => {
  const re = selectionRegex();
  assert.ok(re.source.startsWith("^"), "pattern must be anchored at the start");
  assert.ok(re.source.endsWith("$"), "pattern must be anchored at the end");
  // Near-misses that an unanchored pattern would let through.
  for (const bogus of [
    "prefix-feedhacker-0.4.6.zip",
    "feedhacker-0.4.6.zip.sig",
    "feedhacker-0.4.6-store.zip",
    "feedhacker-0.4.6-win.zip",
    "feedhacker-0.4.6-store-submission.zip",
  ]) {
    assert.ok(!re.test(bogus), `${bogus} must not be selected`);
  }
});

test("the updater still resolves the version from the packaged manifest, not the tag", () => {
  // The tag can lag manifest.json; the installed-vs-latest comparison has to use the
  // version inside the downloaded package or a mismatch loops or no-ops forever.
  assert.match(lib, /manifest\.json/, "lib.ps1 must read the packaged manifest.json");
  assert.match(
    lib,
    /Get-Content \$mani\.FullName -Raw \| ConvertFrom-Json\)\.version/,
    "the latest version must come from the packaged manifest"
  );
});
