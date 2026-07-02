"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { authors } = require("./helper");

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
