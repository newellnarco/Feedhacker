"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { authors } = require("../helper");

test("keyFor prefers the profile path over the name", () => {
  assert.strictEqual(authors.keyFor({ name: "Jane Doe", url: "https://www.linkedin.com/in/jane-doe" }), "/in/jane-doe");
  assert.strictEqual(authors.keyFor({ name: "Acme", url: "https://www.linkedin.com/company/acme/" }), "/company/acme");
  assert.strictEqual(authors.keyFor({ name: "No Link" }), "name:no link");
  assert.strictEqual(authors.keyFor({}), "");
});

test("mute/allow are mutually exclusive and immutable", () => {
  let s = {};
  s = authors.mute(s, "/in/x", "X");
  assert.ok(authors.isMuted(s, "/in/x"));
  const before = JSON.stringify(s);
  const s2 = authors.allow(s, "/in/x", "X");
  assert.strictEqual(JSON.stringify(s), before, "mute() input not mutated by allow()");
  assert.ok(authors.isAllowed(s2, "/in/x"));
  assert.ok(!authors.isMuted(s2, "/in/x"), "allow clears mute");
});

test("record accumulates hidden/shown and computes ratio", () => {
  let s = {};
  s = authors.record(s, "/in/x", "X", true);
  s = authors.record(s, "/in/x", "X", true);
  s = authors.record(s, "/in/x", "X", false);
  const sc = authors.score(s, "/in/x");
  assert.strictEqual(sc.hidden, 2);
  assert.strictEqual(sc.shown, 1);
  assert.ok(Math.abs(sc.ratio - 2 / 3) < 1e-9);
});

test("chronic flags heavy repeat offenders only", () => {
  let s = {};
  for (let i = 0; i < 4; i++) s = authors.record(s, "/in/spam", "Spam", true);
  assert.strictEqual(authors.chronic(s, "/in/spam"), true);
  let q = authors.record({}, "/in/ok", "OK", true);
  assert.strictEqual(authors.chronic(q, "/in/ok"), false);
});

test("topSources ranks by hidden count", () => {
  let s = {};
  s = authors.record(s, "/in/a", "A", true);
  s = authors.record(s, "/in/b", "B", true);
  s = authors.record(s, "/in/b", "B", true);
  const top = authors.topSources(s, 1);
  assert.strictEqual(top.length, 1);
  assert.strictEqual(top[0].key, "/in/b");
  assert.strictEqual(top[0].hidden, 2);
});

test("listMuted / listAllowed reflect the store", () => {
  let s = authors.mute({}, "/in/x", "X");
  s = authors.allow(s, "/in/y", "Y");
  assert.deepStrictEqual(authors.listMuted(s), ["/in/x"]);
  assert.deepStrictEqual(authors.listAllowed(s), ["/in/y"]);
});

// --- unmuteAll: the options page's one-click "Unmute all authors" ---
test("unmuteAll clears every muted author", () => {
  let s = authors.mute(authors.ensure(null), "a", "Ada");
  s = authors.mute(s, "b", "Grace");
  s = authors.mute(s, "c", "Alan");
  assert.strictEqual(authors.listMuted(s).length, 3);
  const cleared = authors.unmuteAll(s);
  assert.deepStrictEqual(authors.listMuted(cleared), []);
  assert.strictEqual(authors.isMuted(cleared, "a"), false);
});

test("unmuteAll leaves the allowlist and the learned scores alone", () => {
  let s = authors.mute(authors.ensure(null), "a", "Ada");
  s = authors.allow(s, "z", "Zoe");
  s = authors.record(s, "a", "Ada", true);
  const cleared = authors.unmuteAll(s);
  assert.deepStrictEqual(authors.listAllowed(cleared), ["z"], "allowlist survives");
  assert.strictEqual(authors.isAllowed(cleared, "z"), true);
  assert.strictEqual(cleared.scores.a.hidden, s.scores.a.hidden, "per-author learning survives");
});

test("unmuteAll does not mutate the store it was given", () => {
  let s = authors.mute(authors.ensure(null), "a", "Ada");
  const before = JSON.stringify(s);
  authors.unmuteAll(s);
  assert.strictEqual(JSON.stringify(s), before, "callers keep their copy (same contract as unmute)");
});

test("unmuteAll on an empty store is a no-op, not a crash", () => {
  assert.deepStrictEqual(authors.listMuted(authors.unmuteAll(authors.ensure(null))), []);
  assert.deepStrictEqual(authors.listMuted(authors.unmuteAll(null)), []);
});
