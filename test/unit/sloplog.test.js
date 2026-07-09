"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { sloplog } = require("../helper");

function decision(over) {
  return Object.assign({
    id: "d1", prob: 0.82, threshold: 0.5, surface: "post", author: "Jane Doe",
    preview: "Let's be honest: this isn't just a post.",
    top: [{ id: "banlist", label: "AI phrasing", value: 1, weight: 3.2, contribution: 3.2 }],
    phrases: ["let's be honest"]
  }, over || {});
}

test("makeEntry normalizes, rounds, and defaults the verdict to null", () => {
  const e = sloplog.makeEntry(decision({ prob: 0.823456 }), 1000);
  assert.strictEqual(e.id, "d1");
  assert.strictEqual(e.ts, 1000);
  assert.ok(e.iso.startsWith("1970-01-01"));
  assert.strictEqual(e.prob, 0.823);              // rounded to 3dp
  assert.strictEqual(e.surface, "post");
  assert.strictEqual(e.label, null);              // no verdict yet
  assert.strictEqual(e.top[0].id, "banlist");
});

test("makeEntry clips the preview for privacy", () => {
  const long = "x".repeat(500);
  const e = sloplog.makeEntry(decision({ preview: long }), 1);
  assert.ok(e.preview.length <= sloplog.PREVIEW_MAX + 1, "preview clipped near PREVIEW_MAX");
  assert.ok(e.preview.endsWith("…"), "clipped preview gets an ellipsis");
});

test("push caps the ring buffer and keeps the newest", () => {
  let list = [];
  for (let i = 0; i < sloplog.MAX + 25; i++) list = sloplog.push(list, sloplog.makeEntry(decision({ id: "x" + i }), i));
  assert.strictEqual(list.length, sloplog.MAX);
  assert.strictEqual(list[list.length - 1].id, "x" + (sloplog.MAX + 24), "newest retained");
});

test("applyVerdict stamps the matching entry and is immutable", () => {
  const before = sloplog.push([], sloplog.makeEntry(decision({ id: "d1" }), 1));
  const after = sloplog.applyVerdict(before, "d1", 0, 5);
  assert.strictEqual(before[0].label, null, "input not mutated");
  assert.strictEqual(after[0].label, 0, "false-positive verdict recorded");
  assert.strictEqual(after[0].verdictAt, 5);
});

test("applyVerdict on an unknown id is a no-op", () => {
  const list = sloplog.push([], sloplog.makeEntry(decision({ id: "d1" }), 1));
  const after = sloplog.applyVerdict(list, "nope", 1, 5);
  assert.strictEqual(after[0].label, null);
});

test("summarize counts verdicts", () => {
  let list = [];
  list = sloplog.push(list, sloplog.makeEntry(decision({ id: "a" }), 1));
  list = sloplog.push(list, sloplog.makeEntry(decision({ id: "b" }), 2));
  list = sloplog.push(list, sloplog.makeEntry(decision({ id: "c" }), 3));
  list = sloplog.applyVerdict(list, "a", 0, 9);   // false positive
  list = sloplog.applyVerdict(list, "b", 1, 9);   // confirmed
  const s = sloplog.summarize(list);
  assert.deepStrictEqual(s, { total: 3, falsePositives: 1, confirmed: 1, unlabeled: 1 });
});
