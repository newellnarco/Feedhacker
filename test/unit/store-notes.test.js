"use strict";
// Unit: the store listing must say what actually shipped, for the version that actually shipped.
//
// The Chrome Web Store has no per-version release-notes field, so "what changed" can only reach
// users inside the one description. Anything maintained by hand there drifts from reality — and
// this project has the receipts: three listing screenshots advertised a feature that had been
// removed two releases earlier, and the listing's filter list was missing one of the nine
// filters the extension actually ships. These assertions make the drift fail the build instead.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const notesSrc = read("store/release-notes.md");
const listing = read("store/listing.md");

// Re-implemented rather than imported: scripts/ is ESM and this suite is CJS. Kept to one
// expression so the two cannot plausibly disagree, and the emptiness assertions below would
// catch it if they did.
function parse(src) {
  return src.split(/\n---\n/).slice(1).join("\n---\n")
    .split(/^## /m)
    .map((c) => c.match(/^(\d+\.\d+\.\d+)\s*\n([\s\S]*)$/))
    .filter(Boolean)
    .map((m) => ({ version: m[1], note: m[2].trim() }));
}

test("the shipping version has a store release note", () => {
  const notes = parse(notesSrc);
  assert.ok(notes.length >= 2, `expected several versions, got ${notes.length}`);
  assert.ok(notes.some((n) => n.version === manifest.version),
    `store/release-notes.md has no "## ${manifest.version}" entry — the store would show a ` +
    `What's-new block that stops before the version being uploaded`);
});

test("every note has a body — the parser must not silently yield empty notes", () => {
  // This is a real regression guard, not a formality. The first parser used
  // /^## (\d+\.\d+\.\d+)\n([\s\S]*?)(?=\n## \d|\s*$)/gm and returned every version with an
  // EMPTY body, because /m makes `$` mean end-of-line, so the lazy group stopped at the first
  // line break. The generator happily printed "v0.9.1" three times with nothing under it.
  for (const n of parse(notesSrc)) {
    assert.ok(n.note.length > 20, `${n.version} has an empty or near-empty note: ${JSON.stringify(n.note)}`);
  }
});

test("notes are newest-first, so the What's-new block leads with this release", () => {
  const cmp = (a, b) => {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
    return 0;
  };
  const got = parse(notesSrc).map((n) => n.version);
  assert.deepStrictEqual(got, [...got].sort(cmp), `not newest-first: ${got.join(", ")}`);
});

test("the store-facing notes do not re-litigate solo", () => {
  // Solo is retired (KNOWN_ISSUES FH-057). A store listing is for deciding whether to install,
  // not for the history of a feature no current version has — and the maintainer asked for no
  // further mention of its removal in shipped material.
  assert.doesNotMatch(notesSrc, /\bsolo\b/i, "store/release-notes.md must not mention solo");
  const desc = listing.match(/### Detailed description\n([\s\S]*?)\n## /);
  assert.ok(desc, "listing.md must have a Detailed description section");
  assert.doesNotMatch(desc[1], /\bsolo\b/i, "the store description must not mention solo");
});

test("the store description names every filter the extension actually ships", () => {
  // The listing was missing "Company / brand posts" — one of the nine — so the store undersold
  // a filter that had been shipping for versions.
  const { filters } = require("../helper");
  const desc = listing.match(/### Detailed description\n([\s\S]*?)\n## /)[1];
  const missing = filters.FILTERS
    .map((f) => f.label)
    .filter((label) => {
      // Compare on the distinctive first word so "Company / brand posts" matches
      // "Company / brand posts" regardless of how the line happens to wrap.
      const key = label.split(/[\s/]+/)[0];
      return !new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(desc);
    });
  assert.deepStrictEqual(missing, [],
    `these shipped filters are not named in the store description: ${missing.join(", ")}`);
});
