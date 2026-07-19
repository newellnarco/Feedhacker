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

test("contentCount counts post-like containers independently of our marker", () => {
  const doc = makeDoc(
    "<!doctype html><body>" +
    '<div role="article">a</div>' +
    '<div data-urn="urn:li:activity:123">b</div>' +
    '<div data-id="urn:li:activity:456">c</div>' +
    "<div>not a post</div>" +
    "</body>"
  );
  assert.strictEqual(selectors.contentCount(doc), 3);
});

test("contentCount is 0 on an empty/loading feed and defensive on a broken doc", () => {
  assert.strictEqual(selectors.contentCount(makeDoc("<!doctype html><body></body>")), 0);
  assert.strictEqual(selectors.contentCount(null), 0);
  assert.strictEqual(selectors.contentCount({}), 0);
});

test("isLoading detects LinkedIn's paging/loading indicators", () => {
  assert.strictEqual(selectors.isLoading(makeDoc('<!doctype html><body><div aria-busy="true"></div></body>')), true);
  assert.strictEqual(selectors.isLoading(makeDoc('<!doctype html><body><div class="artdeco-loader"></div></body>')), true);
  assert.strictEqual(selectors.isLoading(makeDoc('<!doctype html><body><div class="feed-skeleton"></div></body>')), true);
  assert.strictEqual(selectors.isLoading(makeDoc("<!doctype html><body><div>loaded</div></body>")), false);
  assert.strictEqual(selectors.isLoading({}), false);
});

test("heartbeatBreak alarms ONLY on a genuine selector break, never on paging collateral", () => {
  // Genuine break: active tab, not loading, feed has posts, but none match our marker.
  assert.strictEqual(selectors.heartbeatBreak({ active: true, loading: false, markers: 0, content: 4 }), true);
  // The false-alarm cases the fix targets — all must be false:
  assert.strictEqual(selectors.heartbeatBreak({ active: true, loading: false, markers: 0, content: 0 }), false, "empty feed between page loads");
  assert.strictEqual(selectors.heartbeatBreak({ active: true, loading: true, markers: 0, content: 4 }), false, "still loading/paging");
  assert.strictEqual(selectors.heartbeatBreak({ active: false, loading: false, markers: 0, content: 4 }), false, "backgrounded tab");
  assert.strictEqual(selectors.heartbeatBreak({ active: true, loading: false, markers: 3, content: 4 }), false, "markers present — healthy");
  assert.strictEqual(selectors.heartbeatBreak(null), false);
});
