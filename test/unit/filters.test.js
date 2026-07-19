"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { filters } = require("../helper");

test("key === cap(id) invariant holds for every filter", () => {
  for (const f of filters.FILTERS) {
    assert.strictEqual(f.key, filters.cap(f.id), `filter ${f.id} key/id mismatch`);
  }
});

test("FILTER_IDS matches the FILTERS list order", () => {
  assert.deepStrictEqual(filters.FILTER_IDS, filters.FILTERS.map((f) => f.id));
});

test("DEFAULTS has mute/solo booleans for every filter", () => {
  for (const f of filters.FILTERS) {
    assert.strictEqual(typeof filters.DEFAULTS["mute" + f.key], "boolean");
    assert.strictEqual(typeof filters.DEFAULTS["solo" + f.key], "boolean");
    assert.strictEqual(filters.DEFAULTS["solo" + f.key], false, "solo defaults must be off");
  }
});

test("only AI slop is muted by default", () => {
  assert.strictEqual(filters.DEFAULTS.muteSloppy, true);
  const otherMutes = filters.FILTERS.filter((f) => f.id !== "sloppy")
    .map((f) => filters.DEFAULTS["mute" + f.key]);
  assert.ok(otherMutes.every((v) => v === false));
});

test("DEFAULTS includes display keys, all false", () => {
  for (const k of filters.DISPLAY_KEYS) assert.strictEqual(filters.DEFAULTS[k], false);
});

test("master switch defaults to enabled", () => {
  assert.strictEqual(filters.DEFAULTS.enabled, true);
});

test("buildDefaults returns a fresh object each call", () => {
  assert.notStrictEqual(filters.buildDefaults(), filters.buildDefaults());
  assert.deepStrictEqual(filters.buildDefaults(), filters.DEFAULTS);
});

test("applyFixed forces the removed-toggle behaviours over any previously persisted values", () => {
  // Simulate a user who had toggled the (now-removed) Advanced settings to non-defaults, plus
  // unrelated stored settings that must be preserved.
  const stored = {
    autoCalibrate: false,      // user had turned self-tune OFF
    implicitLearning: false,   // user had turned learn-from-scroll OFF
    scanEverywhere: true,      // user had turned filter-beyond-feed ON
    groupHiddenRuns: false,    // user's grouping choice — must be PRESERVED (popup owns it)
    mutePromoted: true,        // unrelated setting — must be preserved
    slopThreshold: 0.7,        // unrelated setting — must be preserved
  };
  const out = filters.applyFixed(stored);
  assert.strictEqual(out.autoCalibrate, true, "self-tune forced on");
  assert.strictEqual(out.implicitLearning, true, "learn-from-scroll forced on");
  assert.strictEqual(out.scanEverywhere, false, "filtering forced home-feed-only");
  assert.strictEqual(out.groupHiddenRuns, false, "grouping left as the user set it");
  assert.strictEqual(out.mutePromoted, true, "unrelated settings preserved");
  assert.strictEqual(out.slopThreshold, 0.7, "unrelated settings preserved");
});

test("applyFixed is defensive on a missing/invalid settings object", () => {
  assert.strictEqual(filters.applyFixed(null), null);
  assert.strictEqual(filters.applyFixed(undefined), undefined);
});
