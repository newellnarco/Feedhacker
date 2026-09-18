"use strict";
// Integration: the Newsletter-signups filter, which had NO test coverage at all.
//
// Found on 2026-09-18 while the maintainer was asking what the filter actually matches. Of the
// nine shipped filters, `newsletter` and `anniversary` were the only two with no test anywhere
// in test/ — so any regression in either was invisible to CI, on a filter that has been
// shipping since 0.2.0.
//
// The thing worth knowing about this filter, and the reason the question was a good one: it
// does not read the post's words at all. There is no phrase list and no text matching. It looks
// for a Subscribe CONTROL — LinkedIn's newsletter card renders one — which is why a post that
// merely plugs a newsletter in prose ("subscribe to my newsletter 👇" plus a link) is not
// matched. That is a gap, not a bug, and pinning it here stops someone "fixing" the filter by
// accident and quietly widening what it hides.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

function baseSettings(over) {
  // AI slop OFF throughout: this file is about one deterministic filter, and a scorer verdict
  // riding along would make a failure ambiguous.
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() },
    { muteSloppy: false, muteNewsletter: true }, over || {});
}
function feedHtml(body) {
  return `<!doctype html><html><body><main><div id="feed">${body}</div></main></body></html>`;
}
let urn = 0;
const post = (inner) => `<div class="post" data-urn="urn:li:activity:n${++urn}"><h2>Feed post</h2>${inner}</div>`;
// Every fixture carries a second, plainly-ordinary post. A lone post hits the documented
// findPostContainers quirk — with nothing else on the page the container walk reaches <html> —
// so the neighbour is what makes the first fixture a POST rather than the whole document.
const NEIGHBOUR = post(`<div>Fixed a caching bug this morning; tests pass, shipping after lunch.</div>`);

const flagsOf = (el) => JSON.parse(el.dataset.feedhackerReasons || "[]").map((r) => r.id);

function scan(html, over) {
  const doc = makeDoc(feedHtml(html + NEIGHBOUR));
  const s = baseSettings(over);
  feed.scan(doc, [], s);
  return { doc, posts: feed.findPostContainers(doc) };
}

test("a newsletter card's Subscribe button is matched", () => {
  const { posts } = scan(post(`<a href="/in/ann">Ann</a><div>Weekly Widgets</div><button><span>Subscribe</span></button>`));
  assert.deepStrictEqual(flagsOf(posts[0]), ["newsletter"], "hidden as a newsletter signup");
  assert.ok(posts[0].classList.contains("feedhacker-hidden"));
});

test("the '+ Subscribe' variant is matched too", () => {
  const { posts } = scan(post(`<div>Weekly Widgets</div><button><span>+ Subscribe</span></button>`));
  assert.deepStrictEqual(flagsOf(posts[0]), ["newsletter"]);
});

test("an aria-labelled control is matched even with no Subscribe text", () => {
  // LinkedIn labels the control rather than captioning it in several layouts.
  const { posts } = scan(post(`<div>Weekly Widgets</div><button aria-label="Subscribe to Weekly Widgets"><span>＋</span></button>`));
  assert.deepStrictEqual(flagsOf(posts[0]), ["newsletter"]);
});

test("'Subscribed' is NOT matched — an existing subscription is not a signup", () => {
  // Neither rule fires: the text rule is exact, and `\b` after "subscribe" fails against the
  // "d" in "Subscribed". Deliberate, and previously nowhere stated or tested.
  const { posts } = scan(post(`<div>Weekly Widgets</div><button aria-label="Subscribed"><span>Subscribed</span></button>`));
  assert.deepStrictEqual(flagsOf(posts[0]), [], "not hidden");
  assert.ok(!posts[0].classList.contains("feedhacker-hidden"));
});

test("the filter reads no words: a prose newsletter plug is not matched", () => {
  const { posts } = scan(post(`<div>New edition is out — subscribe to my newsletter for weekly notes on caching. Link below 👇</div>`));
  assert.deepStrictEqual(flagsOf(posts[0]), [],
    "no Subscribe control, so nothing matches — the filter is structural, not textual");
});

test("off means off", () => {
  const { posts } = scan(post(`<div>Weekly Widgets</div><button><span>Subscribe</span></button>`), { muteNewsletter: false });
  assert.deepStrictEqual(flagsOf(posts[0]), []);
});

// --- nesting: what happens to a quoted post's Subscribe control -------------------------
// These are CHARACTERIZATION tests. They record what the code does with the two shapes a
// quoted post can take, because the answer is not obvious and I got it wrong first: I proposed
// narrowing the aria-label sweep to "this post's own nodes", on the theory that a reshare's
// quoted newsletter would be hidden as the RESHARE's newsletter signup. Probing it showed the
// narrowing was redundant in one shape and inert in the other, so it was dropped rather than
// shipped as a safeguard that isn't one.
const quoted = (innerHtml) => post(
  `<a href="/in/bob">Bob</a><div>Worth a read.</div><div class="quoted">${innerHtml}</div>`);

test("a quoted post WITH its own marker is a separate container, so the reshare is untouched", () => {
  // `postContainerFor` stops climbing at any ancestor holding more than one marker, so the
  // outer entry's container excludes the quote entirely and the quote becomes its own post.
  // That is why no ownership check is needed here: the control is not in the reshare's subtree.
  const { doc, posts } = scan(quoted(
    `<h2>Feed post</h2><div>Weekly Widgets</div><button aria-label="Subscribe to Weekly Widgets"><span>＋</span></button>`));
  const quote = doc.querySelector(".quoted");
  assert.ok(posts.indexOf(quote) !== -1, "the quoted block is its own post container");
  assert.deepStrictEqual(flagsOf(quote), ["newsletter"], "and it is judged on its own");
  // Nothing that is an ancestor of the quote is flagged — i.e. the reshare did not inherit it.
  for (const p of posts) {
    if (p !== quote && p.contains && p.contains(quote)) {
      assert.deepStrictEqual(flagsOf(p), [], "an enclosing container must not be flagged too");
    }
  }
});

test("a quoted block with NO marker is part of the outer post, and its control counts", () => {
  // The honest limit of this filter. With no marker there is nothing to partition on, so the
  // Subscribe control reads as the feed entry's own. Recorded, not fixed: telling the two apart
  // needs a signal we do not have — LinkedIn's quote-container classes are hashed, and the
  // post-identity work (FH item 5) already found no stable per-post attributes on the page.
  const { posts } = scan(quoted(
    `<div>Weekly Widgets</div><button aria-label="Subscribe to Weekly Widgets"><span>＋</span></button>`));
  const outer = posts.find((p) => p.className && String(p.className).indexOf("post") !== -1 && p.querySelector(".quoted"));
  assert.ok(outer, "the outer entry is the container");
  assert.deepStrictEqual(flagsOf(outer), ["newsletter"],
    "documented behaviour: a marker-less quote is indistinguishable from the post's own content");
});
