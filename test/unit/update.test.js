"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { update } = require("../helper");

test("parseVersion strips a leading v and coerces junk to 0", () => {
  assert.deepStrictEqual(update.parseVersion("v1.2.3"), [1, 2, 3]);
  assert.deepStrictEqual(update.parseVersion("0.1.0"), [0, 1, 0]);
  assert.deepStrictEqual(update.parseVersion("1.2"), [1, 2]);
  assert.deepStrictEqual(update.parseVersion("v2.x"), [2, 0]);
  assert.deepStrictEqual(update.parseVersion(""), [0]);
});

test("compareVersions orders component-wise with zero-padding", () => {
  assert.strictEqual(update.compareVersions("1.0.0", "1.0.0"), 0);
  assert.strictEqual(update.compareVersions("1.2.0", "1.2"), 0);
  assert.strictEqual(update.compareVersions("1.2.1", "1.2.0"), 1);
  assert.strictEqual(update.compareVersions("1.2", "1.10"), -1);
  assert.strictEqual(update.compareVersions("2.0", "1.9.9"), 1);
});

test("isNewer is true only when latest strictly exceeds current", () => {
  assert.strictEqual(update.isNewer("0.2.0", "0.1.0"), true);
  assert.strictEqual(update.isNewer("v0.2.0", "0.2.0"), false);
  assert.strictEqual(update.isNewer("0.1.0", "0.2.0"), false);
});

test("apiUrl / releasesUrl target the configured repo", () => {
  assert.match(update.apiUrl(), /api\.github\.com\/repos\/.+\/releases\/latest$/);
  assert.match(update.releasesUrl(), /github\.com\/.+\/releases\/latest$/);
  assert.strictEqual(update.apiUrl("a/b"), "https://api.github.com/repos/a/b/releases/latest");
});

test("checkForUpdate reports an available update from an injected fetch", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ tag_name: "v0.9.0" }) });
  const res = await update.checkForUpdate(fakeFetch, "0.1.0", "a/b");
  assert.strictEqual(res.latest, "0.9.0");
  assert.strictEqual(res.current, "0.1.0");
  assert.strictEqual(res.updateAvailable, true);
  assert.strictEqual(res.url, "https://github.com/a/b/releases/latest");
});

test("checkForUpdate reports up-to-date when versions match", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ tag_name: "0.1.0" }) });
  const res = await update.checkForUpdate(fakeFetch, "0.1.0");
  assert.strictEqual(res.updateAvailable, false);
});

test("checkForUpdate rejects on a non-ok response", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(() => update.checkForUpdate(fakeFetch, "0.1.0"), /HTTP 404/);
});
