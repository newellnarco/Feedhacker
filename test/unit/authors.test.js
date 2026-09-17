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

// --- FH-060: rules vs tallies ---------------------------------------------------------
// The content script re-applies the feed when this store changes. It writes the store
// itself, on a 1.5s debounce, every time a post is hidden — so "the store changed" could
// not mean "re-apply", or the re-apply's own rescan fed the next write. These two answer
// the only question that matters: would the feed be filtered differently?
test("a tally-only change is not a rule change", () => {
  const base = authors.mute(authors.ensure(null), "a", "Ada");
  const busy = authors.record(authors.record(base, "a", "Ada", true), "b", "Bo", false);
  assert.strictEqual(authors.sameRules(base, busy), true, "hide/show counts do not affect filtering");
  assert.strictEqual(authors.rulesKey(base), authors.rulesKey(busy));
});

test("muting, unmuting, allowing and unallowing ARE rule changes", () => {
  const base = authors.ensure(null);
  const muted = authors.mute(base, "a", "Ada");
  assert.strictEqual(authors.sameRules(base, muted), false, "a new mute must re-apply");
  assert.strictEqual(authors.sameRules(muted, authors.unmute(muted, "a")), false, "…and so must an unmute");
  const allowed = authors.allow(base, "z", "Zoe");
  assert.strictEqual(authors.sameRules(base, allowed), false, "a new allow must re-apply");
  assert.strictEqual(authors.sameRules(allowed, authors.unallow(allowed, "z")), false, "…and an unallow");
});

test("rulesKey does not depend on insertion order, and mute/allow can't be confused", () => {
  const ab = authors.mute(authors.mute(authors.ensure(null), "a", "Ada"), "b", "Bo");
  const ba = authors.mute(authors.mute(authors.ensure(null), "b", "Bo"), "a", "Ada");
  assert.strictEqual(authors.rulesKey(ab), authors.rulesKey(ba), "same rules, either order");
  // "a" muted is not the same rule set as "a" allowed — the separator has to keep them apart.
  assert.notStrictEqual(authors.rulesKey(authors.mute(authors.ensure(null), "a", "Ada")),
    authors.rulesKey(authors.allow(authors.ensure(null), "a", "Ada")));
});

test("rulesKey tolerates a null or half-built store", () => {
  assert.strictEqual(authors.rulesKey(null), authors.rulesKey(authors.ensure(null)));
  assert.strictEqual(authors.sameRules(null, {}), true);
});

test("rulesKey cannot be fooled by a comma in an author key", () => {
  // Profile paths may legally contain a comma. A delimiter-joined signature would make these
  // two identical, and the cost of a collision is a mute that silently never takes effect.
  const one = authors.mute(authors.ensure(null), "/in/a,b", "Comma Person");
  const two = authors.mute(authors.mute(authors.ensure(null), "/in/a", "A"), "/in/b", "B");
  assert.notStrictEqual(authors.rulesKey(one), authors.rulesKey(two));
  assert.strictEqual(authors.sameRules(one, two), false);
});
