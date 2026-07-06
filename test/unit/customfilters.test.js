"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { customfilters: cf } = require("../helper");

test("anyConfigured reflects whether any list is set", () => {
  assert.strictEqual(cf.anyConfigured(cf.compile({})), false);
  assert.strictEqual(cf.anyConfigured(cf.compile({ words: ["crypto"] })), true);
});

test("word filter matches whole words only", () => {
  const c = cf.compile({ words: ["crypto"] });
  assert.strictEqual(cf.match("i love crypto now", null, c).length, 1);
  assert.strictEqual(cf.match("cryptography is different", null, c).length, 0);
});

test("regex filter matches and reports the source", () => {
  const c = cf.compile({ regexes: ["\\bweb3\\b"] });
  const flags = cf.match("all about web3 today", null, c);
  assert.strictEqual(flags.length, 1);
  assert.strictEqual(flags[0].type, "regex");
});

test("invalid regex is skipped without throwing", () => {
  const c = cf.compile({ regexes: ["("] });
  assert.strictEqual(c.regexList.length, 0);
});

test("hashtag filter normalizes a leading #", () => {
  const c = cf.compile({ hashtags: ["#hustle", "grindset"] });
  assert.ok(cf.match("my #hustle life", null, c).some((f) => f.type === "hashtag"));
  assert.ok(cf.match("pure #grindset", null, c).some((f) => f.type === "hashtag"));
});

test("company filter matches author name/url, not just text", () => {
  const c = cf.compile({ companies: ["Acme Corp"] });
  assert.ok(cf.match("some post", { name: "Recruiter at Acme Corp", url: "" }, c).some((f) => f.type === "company"));
  assert.strictEqual(cf.match("unrelated post", { name: "Someone Else" }, c).length, 0);
});

test("detail renders a compact human string", () => {
  const c = cf.compile({ words: ["crypto"], hashtags: ["hustle"] });
  const flags = cf.match("crypto #hustle", null, c);
  const d = cf.detail(flags);
  assert.ok(d.includes('"crypto"'));
  assert.ok(d.includes("#hustle"));
});
