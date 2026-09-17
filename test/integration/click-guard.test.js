"use strict";
// FH-063 — the interaction hold-off protected every click except the first one.
//
// A background re-tune re-applies the feed, which can rebuild a stub. To stop that landing
// mid-click, feed.js tells the glue "the user is interacting" and the glue holds the re-apply
// off for 1.5s. But `onInteract()` was called from INSIDE the click handler, so the hold-off
// only ever went up AFTER a click had already been received: the first click in a while — the
// one a user actually notices — was unprotected. FH-060's 1.5s rebuild storm is what made this
// bite constantly; removing the storm did not make the guard correct.
//
// Now the press arms it: pointerdown (and focusin, for the keyboard path) both land before the
// click. Plus one rule with a demonstrable path: recompute() does not re-consider a shown post
// while that post's own control has focus.
//
// A third guard was written and then REMOVED rather than shipped: a holdsFocus() check in
// renderGroupStub. Its test passed with the guard deleted, which means it was testing nothing
// (§54's trap). The reason is that a folded run's head carries `feedhackerGrouphead`, so the
// next groupRuns() reads it as "shown", breaks the run there and never re-renders that row —
// the branch is unreachable while focused. Unreachable defensive code with a vacuous test is
// worse than no code, so both went.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
const HUMAN =
  "Fixed a caching bug this morning: the key included a timestamp, so every lookup missed and " +
  "we were hammering the database on every page load. Tests pass and I am shipping the patch after lunch.";

let urnSeq = 0;
const post = (inner) => `<div class="post" data-urn="urn:li:activity:${++urnSeq}"><h2>Feed post</h2>${inner}</div>`;
const feedHtml = (b) => `<!doctype html><html><body><main><div id="feed">${b}</div></main></body></html>`;

function harness(over) {
  const interacts = [];
  const s = Object.assign({}, filters.DEFAULTS,
    { slopWeights: scorer.defaultWeights(), muteSloppy: true, groupHiddenRuns: false }, over || {});
  s.onInteract = () => { interacts.push(Date.now()); };
  s.onFeedback = () => {}; s.onSlopVerdict = () => {}; s.onSlopDecision = () => {};
  s.onSlopObserve = () => {}; s.onAuthorOutcome = () => {};
  s.onMuteAuthor = () => {}; s.onAllowAuthor = () => {};
  return { s, interacts };
}
const fire = (doc, el, type) =>
  el.dispatchEvent(new doc.defaultView.MouseEvent(type, { bubbles: true }));

test("a pointerdown inside a stub arms the hold-off BEFORE the click lands", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP}</div>`) + post(`<div>${HUMAN}</div>`)));
  const { s, interacts } = harness();
  feed.scan(doc, [], s);
  const btn = doc.querySelector('[data-fh-act="show"]');
  assert.ok(btn, "the slop post has a Show-anyway control");

  fire(doc, btn, "pointerdown");
  assert.strictEqual(interacts.length, 1,
    "the press alone must arm the hold-off — waiting for the click is what left the first one unprotected");
});

test("focusin arms it too, so the keyboard path is not the unprotected one", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP}</div>`) + post(`<div>${HUMAN}</div>`)));
  const { s, interacts } = harness();
  feed.scan(doc, [], s);
  fire(doc, doc.querySelector('[data-fh-act="show"]'), "focusin");
  assert.strictEqual(interacts.length, 1, "tabbing to the control counts as interacting");
});

test("a press OUTSIDE our UI does not arm it", () => {
  // Otherwise every scroll and every click on LinkedIn's own chrome would suppress re-applies.
  const doc = makeDoc(feedHtml(post(`<div>${SLOP}</div>`) + post(`<div>${HUMAN}</div>`)));
  const { s, interacts } = harness();
  feed.scan(doc, [], s);
  fire(doc, doc.getElementById("feed"), "pointerdown");
  assert.strictEqual(interacts.length, 0, "the feed itself is not ours");
});

test("the click still arms it, so a synthetic click with no press is not left unguarded", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP}</div>`) + post(`<div>${HUMAN}</div>`)));
  const { s, interacts } = harness();
  feed.scan(doc, [], s);
  fire(doc, doc.querySelector('[data-fh-act="show"]'), "click");
  assert.ok(interacts.length >= 1, "the original click-time arming is kept as well");
});

test("…and a shown post whose own control is focused is not re-scanned by recompute", () => {
  const doc = makeDoc(feedHtml(post(`<div>${HUMAN}</div>`) + post(`<div>${SLOP}</div>`)));
  const { s } = harness();
  feed.scan(doc, [], s);
  const shown = feed.findPostContainers(doc)[0];
  const mark = shown.querySelector('[data-fh-act="mark-slop"]');
  assert.ok(mark, "the shown post carries the mark control (FH-062)");

  // `feedhackerRepeat` is the honest observable: consider() sets it the moment it finds a prior
  // verdict, so its absence means consider() never ran on this node. (feedhackerScanned is not
  // usable here — recompute deletes it and the scan() it then calls sets it straight back, so it
  // reads "1" either way by the time recompute returns.)
  assert.strictEqual(shown.dataset.feedhackerRepeat, undefined, "not re-considered yet");
  mark.focus();
  feed.recompute(doc, [], s);
  assert.strictEqual(shown.dataset.feedhackerRepeat, undefined,
    "recompute must not re-consider a post while its own control has focus");
  assert.strictEqual(shown.dataset.feedhackerScanned, "1", "…so the scanned flag was never cleared");
  assert.strictEqual(shown.querySelector('[data-fh-act="mark-slop"]'), mark,
    "…and the control itself is untouched");
});

test("recompute still re-scans shown posts that are NOT focused", () => {
  // The guard must not become a way for posts to escape a tightened model.
  const doc = makeDoc(feedHtml(post(`<div>${HUMAN}</div>`) + post(`<div>${SLOP}</div>`)));
  const { s } = harness();
  feed.scan(doc, [], s);
  const shown = feed.findPostContainers(doc)[0];
  assert.strictEqual(shown.dataset.feedhackerRepeat, undefined, "not re-considered yet");
  feed.recompute(doc, [], s);
  assert.strictEqual(shown.dataset.feedhackerRepeat, "1",
    "with nothing focused, recompute DOES re-consider it, so a tightened model can still re-hide it");
});
