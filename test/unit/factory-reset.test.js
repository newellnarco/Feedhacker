"use strict";
// Unit: the factory reset must actually clear EVERYTHING FeedHacker persists.
//
// The failure mode this guards is quiet and nasty: someone adds a new stored key (another
// learned buffer, another cache), forgets to add it to the reset list, and "factory reset"
// silently leaves the old state behind — so a user resetting to escape a poisoned model keeps
// the very thing they were trying to clear. Rather than trust a hand-kept list, this reads the
// source and fails when a persisted key is not covered.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "..", "src");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

// "feedhacker:*" is used for two different things: chrome.storage keys (which a factory reset
// must clear) and chrome.runtime message types (which are transient and have nothing to clear).
// Message types are listed explicitly so a NEW storage key can never be waved through as one.
const MESSAGE_TYPES = new Set([
  "feedhacker:count", "feedhacker:error", "feedhacker:clearError",
  "feedhacker:kick", "feedhacker:selfUpdate", "feedhacker:storeUpdate",
]);

// Every "feedhacker:*" storage key literal that appears anywhere in the extension source.
function persistedKeys() {
  const found = new Set();
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(SRC, f), "utf8");
    for (const m of src.matchAll(/["'](feedhacker:[a-zA-Z0-9_-]+)["']/g)) {
      if (!MESSAGE_TYPES.has(m[1])) found.add(m[1]);
    }
  }
  return found;
}

// The key names LOCAL_KEYS resolves to, taken from the const declarations in options.ts.
function resetKeys() {
  const src = read("options.ts");
  const block = src.match(/var LOCAL_KEYS = \[([\s\S]*?)\];/);
  assert.ok(block, "options.ts must declare LOCAL_KEYS");
  const names = block[1].split(",").map((s) => s.trim()).filter(Boolean);
  return new Set(names.map((n) => {
    const decl = src.match(new RegExp("var " + n + ' = (?:[A-Za-z]+ \\? [A-Za-z._]+ : )?"(feedhacker:[^"]+)"'));
    assert.ok(decl, `could not resolve ${n} to a storage key`);
    return decl[1];
  }));
}

test("LOCAL_KEYS names a real storage key for every entry", () => {
  assert.ok(resetKeys().size >= 10, "expected the full set of persisted keys");
});

test("factory reset covers EVERY feedhacker: key the source persists", () => {
  const covered = resetKeys();
  const missing = [...persistedKeys()].filter((k) => !covered.has(k));
  assert.deepStrictEqual(missing, [],
    "these storage keys survive a factory reset — add them to LOCAL_KEYS in options.ts");
});

test("the reset restores the shipped defaults, not a hand-written literal", () => {
  // buildDefaults() is the single source of truth for a clean install; a literal here would
  // drift the moment a default changes.
  const src = read("options.ts");
  assert.match(src, /chrome\.storage\.sync\.set\(Filters\.buildDefaults\(\)/,
    "factory reset must write Filters.buildDefaults()");
  assert.match(src, /chrome\.storage\.sync\.clear\(/,
    "and clear sync first, so a key we no longer ship cannot survive");
});

test("a clean install means AI slop on and nothing else", () => {
  // This is the state factory reset returns you to, asserted directly.
  const { filters } = require("../helper");
  const d = filters.buildDefaults();
  assert.strictEqual(d.muteSloppy, true, "the default AI algorithm stays on");
  for (const f of filters.FILTERS) {
    assert.strictEqual(d["solo" + f.key], false, "no solo mode on a clean install");
    if (f.id !== "sloppy") assert.strictEqual(d["mute" + f.key], false, "no other filter on");
  }
  for (const k of filters.DISPLAY_KEYS) assert.strictEqual(d[k], false);
});
