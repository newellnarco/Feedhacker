"use strict";
// Integration: the Work-anniversary filter — the last of the nine shipped filters with no test.
//
// Found 2026-09-18 while closing the same gap for `newsletter`: a per-filter sweep of test/
// showed those two were the only ones of the nine referenced by no test anywhere, so a
// regression in either was invisible to CI on a filter shipping since 0.2.0. `newsletter` got
// test/integration/newsletter.test.js then; this is the other half (SESSION-STATE §1 item 16).
//
// Unlike `newsletter` — which reads no words at all and looks for a Subscribe CONTROL — this one
// is PURELY textual: a single regex in feed.ts's CATEGORIES, matched against the post's text with
// its comments stripped out. That makes its blast radius the regex, so the cases below are
// mostly about where the regex's edges actually fall. Several were a surprise, which is the point
// of writing them down: they were established by probing the live regex, not by reading it.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

function baseSettings(over) {
  // AI slop OFF throughout: this file is about one deterministic filter, and a scorer verdict
  // riding along would make a failure ambiguous (same reasoning as the newsletter suite).
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() },
    { muteSloppy: false, muteAnniversary: true }, over || {});
}
function feedHtml(body) {
  return `<!doctype html><html><body><main><div id="feed">${body}</div></main></body></html>`;
}
let urn = 0;
const post = (inner) => `<div class="post" data-urn="urn:li:activity:a${++urn}"><h2>Feed post</h2>${inner}</div>`;
// Every fixture carries a second, plainly-ordinary post. A lone post hits the documented
// findPostContainers quirk — with nothing else on the page the container walk reaches <html> —
// so the neighbour is what makes the first fixture a POST rather than the whole document.
const NEIGHBOUR = post(`<div>Fixed a caching bug this morning; tests pass, shipping after lunch.</div>`);

const flagsOf = (el) => JSON.parse(el.dataset.feedhackerReasons || "[]").map((r) => r.id);

function scan(html, over) {
  const doc = makeDoc(feedHtml(html + NEIGHBOUR));
  feed.scan(doc, [], baseSettings(over));
  return { doc, posts: feed.findPostContainers(doc) };
}
const body = (text) => post(`<a href="/in/dana">Dana</a><div>${text}</div>`);

// --- the cases the filter exists for ----------------------------------------------------
test("a work-anniversary post is hidden", () => {
  const { posts } = scan(body("Celebrating my work anniversary at Acme today!"));
  assert.deepStrictEqual(flagsOf(posts[0]), ["anniversary"]);
  assert.ok(posts[0].classList.contains("feedhacker-hidden"));
});

test("the congratulatory form is matched too", () => {
  // `happy .{0,15}anniversary` — the second-person post, which is most of them.
  const { posts } = scan(body("Happy 5th work anniversary, Dana! 🎉"));
  assert.deepStrictEqual(flagsOf(posts[0]), ["anniversary"]);
});

test("'celebrating N years' is matched without the word anniversary", () => {
  const { posts } = scan(body("Celebrating 10 years! What a ride."));
  assert.deepStrictEqual(flagsOf(posts[0]), ["anniversary"]);
});

test("'N years of service' is matched", () => {
  const { posts } = scan(body("3 years of service recognised today."));
  assert.deepStrictEqual(flagsOf(posts[0]), ["anniversary"]);
});

// --- the edges, all established by probing the regex ------------------------------------
test("the bare word 'anniversary' is NOT enough", () => {
  // Deliberate and previously nowhere stated: every alternative needs a qualifier — `work`,
  // `happy …`, `my …`, `celebrating … N years`, `N years at/with/of service`. So a post that
  // merely uses the word survives. This is the assertion that would fail if someone "simplified"
  // the regex to /anniversary/i, which would hide book editions, product launches and reviews.
  const { posts } = scan(body("The anniversary edition of the book is out this week."));
  assert.deepStrictEqual(flagsOf(posts[0]), [], "not hidden");
  assert.ok(!posts[0].classList.contains("feedhacker-hidden"));
});

test("an ordinary post is untouched", () => {
  const { posts } = scan(body("Shipped a caching fix; the p99 dropped by 40ms."));
  assert.deepStrictEqual(flagsOf(posts[0]), []);
});

test("the qualifier must be on the same LINE as 'anniversary'", () => {
  // `.` does not match a newline, so `happy .{0,15}anniversary` cannot span one. Worth pinning
  // because it is invisible in the source and a later `s` flag would silently widen the filter.
  const { posts } = scan(body("Happy birthday Dana!<br>Also: anniversary season is upon us."));
  assert.deepStrictEqual(flagsOf(posts[0]), []);
});

test("an anniversary phrase in a COMMENT does not flag the post", () => {
  // getPostText strips the comment section before matching, so someone congratulating an
  // anniversary under an unrelated post cannot hide that post. The invariant is shared with
  // every other text filter; this is the anniversary-shaped instance of it.
  const { posts } = scan(post(
    `<a href="/in/dana">Dana</a><div>Shipped a caching fix; the p99 dropped by 40ms.</div>` +
    `<div><div aria-label="Add a comment"></div><div>Happy work anniversary, by the way!</div></div>`));
  assert.deepStrictEqual(flagsOf(posts[0]), [],
    "a claudism-in-a-comment must not flag its host post — same rule, anniversary flavour");
});

test("off means off", () => {
  const { posts } = scan(body("Celebrating my work anniversary at Acme today!"), { muteAnniversary: false });
  assert.deepStrictEqual(flagsOf(posts[0]), []);
});

test("and off is the SHIPPED default", () => {
  // Its own case on purpose. The test above passes the value in from a fixture, so it says
  // nothing about what ships; the default is what a user inherits by doing nothing, and here it
  // is what keeps the two over-matches below from biting anyone who has not opted in (§59).
  assert.strictEqual(filters.DEFAULTS.muteAnniversary, false,
    "Work anniversaries must stay default-OFF — see the characterization cases below");
  const doc = makeDoc(feedHtml(body("Celebrating my work anniversary at Acme today!") + NEIGHBOUR));
  feed.scan(doc, [], Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights(), muteSloppy: false }));
  assert.deepStrictEqual(flagsOf(feed.findPostContainers(doc)[0]), [],
    "with shipped defaults the post is not hidden");
});

// --- CHARACTERIZATION: two over-matches, and the maintainer's decision to KEEP them -----
// Both were found by probing the regex for this suite, and both are real: the filter hides posts
// that are not work-anniversary posts (KNOWN_ISSUES FH-072).
//
// **SETTLED 2026-09-22 — the regex stays as it is. The maintainer was shown both over-matches and
// the three options, and chose to leave it: "leave the anniversary regex as-is."** So these two
// cases are no longer "pending a decision" — they are the AGREED behaviour, and the assertions
// below are the contract. Do not narrow the pattern to "fix" them, and do not re-open the
// question without the maintainer asking: the reasoning is that the obvious narrowing loses true
// positives ("10 years at Acme!" IS an anniversary post), and the filter ships default-OFF, so
// only a user who opted in sees either one.
//
// If it is ever narrowed deliberately, on the maintainer's word, these are the two assertions to
// invert — and this comment is the thing to rewrite first.
test("a reflection post is caught by 'N years at' (over-match, documented)", () => {
  const { posts } = scan(body(
    "After 10 years at Google I've learned that microservices are mostly a tax on your future self."));
  assert.deepStrictEqual(flagsOf(posts[0]), ["anniversary"],
    "documented over-match: `\\b\\d+\\s+years?\\s+at\\b` cannot tell a tenure anniversary from a " +
    "post that merely mentions a tenure");
});

test("a PERSONAL anniversary is caught by 'my … anniversary' (over-match, documented)", () => {
  // The filter is labelled "Work anniversaries" and this post is not about work at all.
  const { posts } = scan(body("Today is my wedding anniversary — ten years with the best person I know."));
  assert.deepStrictEqual(flagsOf(posts[0]), ["anniversary"],
    "documented over-match: `my .{0,10}anniversary` spans wedding/birthday/any personal one");
});
