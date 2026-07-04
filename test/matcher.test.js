"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { matcher } = require("./helper");

const DATA = {
  entries: [
    { id: "literal-a", category: "confirmed", matchType: "literal", match: ["sit with", "worth sitting with"] },
    { id: "aggr", category: "aggressive", matchType: "literal", match: ["shape"], aggressive: true },
    { id: "rx", category: "confirmed", matchType: "regex", pattern: "\\bdelve\\b" },
    { id: "emoji", category: "confirmed", matchType: "regex", pattern: "\\p{Emoji_Presentation}", minCount: 3 },
    { id: "manual-only", matchType: "manual", note: "no auto match" },
    { id: "bad-regex", matchType: "regex", pattern: "(" }
  ]
};

test("escapeRe escapes regex metacharacters", () => {
  assert.strictEqual(matcher.escapeRe("a.b*c"), "a\\.b\\*c");
});

test("buildMatchers skips manual and keeps category/aggressive", () => {
  const ms = matcher.buildMatchers(DATA);
  const ids = ms.map((m) => m.id);
  assert.ok(!ids.includes("manual-only"), "manual entries excluded");
  const aggr = ms.find((m) => m.id === "aggr");
  assert.strictEqual(aggr.aggressive, true);
  assert.strictEqual(aggr.category, "aggressive");
});

test("literal matcher uses word boundaries (no partial-word hits)", () => {
  const ms = matcher.buildMatchers(DATA);
  assert.deepStrictEqual(matcher.findHits(ms, "please sit with this idea", false).includes("literal-a"), true);
  // "shapeshifter" should NOT match the aggressive "shape" (boundary guard), and
  // aggressive off means it's skipped anyway.
  assert.strictEqual(matcher.findHits(ms, "a shapeshifter appeared", false).includes("aggr"), false);
});

test("aggressive matchers only fire when aggressive=true", () => {
  const ms = matcher.buildMatchers(DATA);
  assert.strictEqual(matcher.findHits(ms, "the shape of things", false).includes("aggr"), false);
  assert.strictEqual(matcher.findHits(ms, "the shape of things", true).includes("aggr"), true);
});

test("minCount regex requires the threshold count", () => {
  const ms = matcher.buildMatchers(DATA);
  assert.strictEqual(matcher.findHits(ms, "one 😀 two 😀", false).includes("emoji"), false);
  assert.strictEqual(matcher.findHits(ms, "😀 😀 😀 party", false).includes("emoji"), true);
});

test("findHitDetails returns matched text plus category/aggressive", () => {
  const ms = matcher.buildMatchers(DATA);
  const det = matcher.findHitDetails(ms, "let's delve into this", false);
  const rx = det.find((d) => d.id === "rx");
  assert.ok(rx);
  assert.strictEqual(rx.category, "confirmed");
  assert.strictEqual(rx.text.toLowerCase(), "delve");
});

test("invalid regex entries are dropped, not thrown", () => {
  const ms = matcher.buildMatchers(DATA);
  assert.strictEqual(ms.find((m) => m.id === "bad-regex"), undefined);
});
