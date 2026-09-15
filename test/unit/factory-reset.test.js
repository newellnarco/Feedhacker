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

// The key names SLOP_LOCAL_KEYS resolves to — the subset "Reset AI-slop learning" must clear.
function slopResetKeys() {
  const src = read("options.ts");
  // Bind the list to its use: a perfect list the handler ignores is exactly the bug (it
  // removed WEIGHTS_KEY alone), so every assertion below depends on the handler reading it.
  assert.match(src, /storage\.local\.remove\(SLOP_LOCAL_KEYS/,
    "the reset-learning handler must clear SLOP_LOCAL_KEYS");
  const block = src.match(/var SLOP_LOCAL_KEYS = \[([\s\S]*?)\];/);
  assert.ok(block, "options.ts must declare SLOP_LOCAL_KEYS");
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


// --- FH-054: "Reset AI-slop learning" must actually reset the AI -----------------------------

test("Reset AI-slop learning clears EVERY piece of learned AI state, not just the weights", () => {
  // The bug: it removed WEIGHTS_KEY alone. The training buffer, the observation pool and the
  // self-tuned calibration all survived, so auto-calibration rebuilt the same model from them
  // within a scan or two — the reset looked like it worked and changed nothing that lasted.
  const keys = slopResetKeys();
  for (const k of ["feedhacker:slopWeights", "feedhacker:sloptrain", "feedhacker:slopobs", "feedhacker:slopcal"]) {
    assert.ok(keys.has(k), `${k} must be cleared by the AI reset — leaving it rebuilds the model`);
  }
  assert.ok(keys.has("feedhacker:sloplog"), "the AI decision log is the AI's own record of itself");
});

test("Reset AI-slop learning leaves everything that is NOT the AI alone", () => {
  // The other half of the contract: resetting the model must not cost you your setup.
  const keys = slopResetKeys();
  for (const k of ["feedhacker:authors", "feedhacker:custom", "feedhacker:stats", "feedhacker:errorlog"]) {
    assert.ok(!keys.has(k), `${k} is not the AI — only factory reset clears it`);
  }
});

test("the AI reset removes SLOP_LOCAL_KEYS, not a lone key, and restores tuning from buildDefaults()", () => {
  const src = read("options.ts");
  const handler = src.match(/byId\("reset-learning"\)\.addEventListener\([\s\S]*?\n\}\);/);
  assert.ok(handler, "options.ts must wire the reset-learning button");
  const body = handler[0];
  assert.match(body, /storage\.local\.remove\(SLOP_LOCAL_KEYS/,
    "must clear the whole list, so a new AI key cannot be missed");
  assert.doesNotMatch(body, /storage\.local\.remove\(WEIGHTS_KEY\b/,
    "clearing the weights alone is the bug this replaced");
  assert.match(body, /Filters\.buildDefaults\(\)/,
    "the AI tuning must come from the shipped defaults, not a literal");
  // And it must not reach for sync.clear() — that would wipe the user's mute/solo choices.
  assert.doesNotMatch(body, /storage\.sync\.clear\(/,
    "the AI reset must never clear sync — mute/solo/display settings are not the AI's to touch");
});

test("the AI tuning keys the reset restores are real defaults, and filter choices are not among them", () => {
  const { filters } = require("../helper");
  const src = read("options.ts");
  const block = src.match(/var SLOP_SYNC_KEYS = \[([\s\S]*?)\];/);
  assert.ok(block, "options.ts must declare SLOP_SYNC_KEYS");
  const keys = block[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const d = filters.buildDefaults();

  assert.ok(keys.length > 0, "the AI reset must restore its sync-side tuning");
  for (const k of keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(d, k), `${k} must exist in buildDefaults()`);
    // A mute*/solo* key here would silently reset the user's filter choices.
    assert.doesNotMatch(k, /^(mute|solo)/, `${k} is a filter choice — the AI reset must not restore it`);
  }
  // The self-tuned cutoff is the one that actually re-poisons a "reset" model if it survives.
  assert.ok(keys.includes("slopThreshold"),
    "the self-tuned threshold must go back to default — FH-050 found it pulled to 0.428–0.471");
});
