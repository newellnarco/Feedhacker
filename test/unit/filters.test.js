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
