"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { selectors, makeDoc } = require("../helper");

test("isHomeFeed matches only the home feed path", () => {
  assert.strictEqual(selectors.isHomeFeed("/feed/"), true);
  assert.strictEqual(selectors.isHomeFeed("/feed"), true);
  assert.strictEqual(selectors.isHomeFeed("/feed/update/urn:li:activity:1/"), false);
  assert.strictEqual(selectors.isHomeFeed("/in/jane"), false);
  assert.strictEqual(selectors.isHomeFeed(""), false);
});

test("isSupportedSurface covers the opt-in surfaces beyond the home feed", () => {
  for (const p of ["/feed/", "/feed/update/urn:li:activity:1/", "/search/results/all/", "/company/acme/", "/school/mit/", "/in/jane-doe"]) {
    assert.strictEqual(selectors.isSupportedSurface(p), true, `${p} should be supported`);
  }
  assert.strictEqual(selectors.isSupportedSurface("/messaging/thread/1"), false);
  assert.strictEqual(selectors.isSupportedSurface("/jobs/"), false);
});

test("MARKER_RE recognizes the hidden post/promoted markers (prefix-anchored)", () => {
  assert.ok(selectors.MARKER_RE.test("Feed post"));
  assert.ok(selectors.MARKER_RE.test("Promoted"));
  assert.ok(selectors.MARKER_RE.test("Promoted")); // heading marker only; the "Promoted to VP" text guard lives in feed.isPromoted
  assert.ok(!selectors.MARKER_RE.test("Suggested"));
  assert.ok(!selectors.MARKER_RE.test("A feed post")); // must be a prefix, not mid-string
});

test("markerCount counts only post-marker headings", () => {
  const doc = makeDoc(
    "<!doctype html><body>" +
    "<h2>Feed post</h2><h2>Promoted</h2><h2>People you may know</h2><h3>Feed post</h3>" +
    "</body>"
  );
  assert.strictEqual(selectors.markerCount(doc), 2); // two matching h2s; h3 ignored
});

test("markerCount is defensive on a broken document", () => {
  assert.strictEqual(selectors.markerCount(null), 0);
  assert.strictEqual(selectors.markerCount({}), 0);
});
