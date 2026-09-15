"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { selectors, makeDoc } = require("../helper");

// LinkedIn's redesigned feed, transcribed from two live 2026-09-15 home-feed captures.
const FEED_2026_09 = fs.readFileSync(path.join(__dirname, "..", "fixtures", "linkedin-feed-2026-09.html"), "utf8");

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

test("contentCount sees LinkedIn's CURRENT markup, which has none of the retired hooks (FH-052)", () => {
  // The regression that mattered: the probe was only ever exercised against synthetic markup
  // carrying role="article", which by construction could not exhibit the bug (best_practices §49).
  // This runs it against the shape LinkedIn actually ships, captured live on 2026-09-15.
  const doc = makeDoc("<!doctype html><body>" + FEED_2026_09 + "</body>");

  // Guard the fixture itself: if it ever drifts back into carrying a retired hook, this test
  // would start passing for the wrong reason, so assert the absence that makes it meaningful.
  assert.strictEqual(doc.querySelectorAll('[role="article"]').length, 0, "fixture must have no role=article");
  assert.strictEqual(doc.querySelectorAll('[data-urn],[data-id]').length, 0, "fixture must have no data-urn/data-id");

  // Our marker still matches on this markup, so the feed is healthy...
  assert.strictEqual(selectors.markerCount(doc), 3, "the hidden 'Feed post' headings still parse");
  // ...and the INDEPENDENT probe must agree that posts are on the page. Pre-fix this was 0.
  assert.strictEqual(selectors.contentCount(doc), 3, "content probe must see today's posts");
});

test("a marker break on CURRENT markup actually alarms — the heartbeat is not disarmed (FH-052)", () => {
  // The whole point of the probe: heartbeatBreak() requires content > 0, so a probe blind to
  // today's markup pins content at 0 and the alarm can NEVER fire. Simulate our marker going
  // stale (LinkedIn renames the hidden heading) and assert we would notice.
  const doc = makeDoc("<!doctype html><body>" + FEED_2026_09.replace(/Feed post/g, "Update") + "</body>");

  assert.strictEqual(selectors.markerCount(doc), 0, "marker no longer matches — this is the break");
  assert.ok(selectors.contentCount(doc) > 0, "but the posts are plainly still there");
  assert.strictEqual(
    selectors.heartbeatBreak({
      active: true,
      loading: selectors.isLoading(doc),
      markers: selectors.markerCount(doc),
      content: selectors.contentCount(doc)
    }),
    true,
    "a real selector break on today's markup must alarm"
  );
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

test("feed.ts's defensive fallbacks stay byte-identical to the canonical contract", () => {
  // feed.ts inlines copies of MARKER_RE / FURNITURE_RE / POST_CONTROL_SELECTOR for the case
  // where selectors.js has not loaded. A copy that drifts is a bug you only meet in the
  // fallback path, where nobody looks — and it happened: the first cut of FURNITURE_RE kept a
  // trailing \b here after it had been dropped there, so the fallback could never match.
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "src", "feed.ts"), "utf8");

  assert.ok(src.includes(String(selectors.MARKER_RE)),
    "feed.ts's MARKER_RE fallback must match selectors.ts");
  assert.ok(src.includes(String(selectors.FURNITURE_RE)),
    "feed.ts's FURNITURE_RE fallback must match selectors.ts");
  assert.ok(src.includes(JSON.stringify(selectors.POST_CONTROL_SELECTOR).replace(/"/g, "'")) ||
            src.includes(selectors.POST_CONTROL_SELECTOR),
    "feed.ts's POST_CONTROL fallback must match selectors.ts");
});

test("FURNITURE_RE matches the real, un-spaced text LinkedIn renders", () => {
  // The heading and the next element's text are adjacent nodes, so there is no whitespace
  // between them. Anchoring on a word boundary here silently matches nothing.
  const real = "Feed postWho's viewed your profileSteve Hawkins • 1stDirector of Security";
  assert.match(selectors.stripMarker(real), selectors.FURNITURE_RE);
  assert.match(selectors.stripMarker("Feed postJobs recommended for youVice President, Apps"), selectors.FURNITURE_RE);
  // Curly apostrophe too — LinkedIn uses it in places.
  assert.match(selectors.stripMarker("Feed postWho\u2019s viewed your profileX"), selectors.FURNITURE_RE);
  // And an ordinary post must not match.
  assert.doesNotMatch(selectors.stripMarker("Feed postAvery Lindqvist • 1st Platform lead"), selectors.FURNITURE_RE);
});
