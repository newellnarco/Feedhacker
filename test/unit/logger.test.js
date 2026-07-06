"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { logger } = require("../helper");

test("sourceFromStack extracts the first file:line:col frame", () => {
  const stack = "Error: boom\n    at foo (chrome-extension://abc/content.js:145:12)\n    at bar (feed.js:10:1)";
  assert.strictEqual(logger.sourceFromStack(stack), "content.js:145:12");
});

test("sourceFromStack returns empty string on no stack", () => {
  assert.strictEqual(logger.sourceFromStack(""), "");
  assert.strictEqual(logger.sourceFromStack(undefined), "");
});

test("makeEntry captures message, iso timestamp, context and source", () => {
  const err = new Error("Failed to fetch");
  err.stack = "Error: Failed to fetch\n    at init (content.js:145:12)";
  const e = logger.makeEntry(err, "banlist-fetch", 1751462591000);
  assert.strictEqual(e.msg, "Failed to fetch");
  assert.strictEqual(e.context, "banlist-fetch");
  assert.strictEqual(e.source, "content.js:145:12");
  assert.strictEqual(e.ts, 1751462591000);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(e.iso));
});

test("makeEntry handles non-Error values", () => {
  const e = logger.makeEntry("plain string problem", "ctx", 1000);
  assert.strictEqual(e.msg, "plain string problem");
  assert.strictEqual(e.source, "");
});

test("push caps the ring buffer and keeps newest", () => {
  let list = [];
  for (let i = 0; i < 60; i++) list = logger.push(list, { msg: "e" + i }, 50);
  assert.strictEqual(list.length, 50);
  assert.strictEqual(list[0].msg, "e10");
  assert.strictEqual(list[list.length - 1].msg, "e59");
});

test("push does not mutate the input array", () => {
  const list = [{ msg: "a" }];
  const out = logger.push(list, { msg: "b" });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(out.length, 2);
});

test("format renders a readable date-time cause line", () => {
  const e = logger.makeEntry(new Error("nope"), "scan", 1751462591000);
  e.source = "feed.js:12:3";
  const s = logger.format(e);
  assert.ok(s.includes("scan: nope"));
  assert.ok(s.includes("(feed.js:12:3)"));
  assert.ok(!s.includes("T"), "date/time should be space-separated, not ISO T");
});
