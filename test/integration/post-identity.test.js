"use strict";
// FH-049 / FH-050 — from a real exported decision log (v0.4.8, 2026-09-08):
//
//   300 decisions ... but only 13 DISTINCT posts, over 11 minutes
//   one post judged 42 times in 63 seconds (~1.6s apart)
//   164 observations -> 19 distinct feature vectors
//   training buffer: 95 "slop" labels vs 17 "not slop", nearly all the same few posts
//   "Jobs recommended for you" hidden at p=0.564 (broetry 1.00, spaced 0.92)
//   an emoji-only comment hidden at p=0.608; a profile headline judged 31 times
//
// "Judge each post once" was keyed on a `data-feedhacker-scanned` attribute, and LinkedIn
// REPLACES feed nodes — so the attribute died with the node and the post came back looking
// brand new. Identity now outlives the node (activity URN, else a text hash).
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";

function feedHtml(b) { return `<!doctype html><html><body><main><div id="feed">${b}</div></main></body></html>`; }
// findPostContainers walks UP from each "Feed post" marker until it finds an ancestor holding
// more than one marker. With a single post in the fixture there is no such ancestor, so it
// walks to <html> and the whole document becomes "the post" — which quietly made an earlier
// draft of these tests pass for the wrong reason. Every fixture here therefore carries a
// second, plainly-human post so containers resolve to the real post divs.
const HUMAN = "Fixed a caching bug this morning. Tests pass, and I am shipping the patch after lunch today.";
function withNeighbour(b) { return b + post(999, `<div>${HUMAN}</div>`); }
function post(urn, inner) {
  return `<div class="post"${urn ? ` data-urn="urn:li:activity:${urn}"` : ""}><h2>Feed post</h2>${inner}</div>`;
}
function harness(over) {
  const decisions = [], observed = [];
  const s = Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() },
    { groupHiddenRuns: false }, over || {});
  s.onSlopDecision = (d) => decisions.push(d);
  s.onSlopObserve = (f) => observed.push(f);
  s.onFeedback = () => {}; s.onSlopVerdict = () => {}; s.onAuthorOutcome = () => {};
  s.onMuteAuthor = () => {}; s.onAllowAuthor = () => {};
  return { s, decisions, observed };
}
// LinkedIn re-rendering a post: it rebuilds the subtree from ITS OWN state, so the new node
// carries none of our attributes, none of our classes, and not our injected stub. Modelling
// only the data-attributes would leave the stub's text in the node and change its text hash —
// making the simulation, not the code, decide the result.
function rerender(doc) {
  const feedEl = doc.getElementById("feed");
  const scrub = (n) => {
    n.classList.remove("feedhacker-hidden", "feedhacker-gone", "feedhacker-dismissing");
    if (!n.classList.length) n.removeAttribute("class");
    [...n.attributes].forEach((a) => { if (a.name.startsWith("data-feedhacker")) n.removeAttribute(a.name); });
  };
  feedEl.querySelectorAll(".feedhacker-stub").forEach((n) => n.remove());
  feedEl.querySelectorAll("*").forEach(scrub);
  scrub(feedEl);
  feedEl.innerHTML = feedEl.innerHTML;   // force brand-new nodes, as a real re-render does
}

test("a re-rendered post is judged ONCE, not again on every render", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(101, `<div>${SLOP}</div>`))));
  const { s, decisions, observed } = harness();
  feed.scan(doc, [], s);
  assert.strictEqual(decisions.length, 1, "the slop post is judged once on the first scan");
  const observedFirst = observed.length;
  assert.ok(observedFirst >= 2, "both posts observed");

  for (let i = 0; i < 20; i++) { rerender(doc); feed.scan(doc, [], s); }

  assert.strictEqual(decisions.length, 1,
    `20 re-renders must not produce 20 more decisions (got ${decisions.length})`);
  assert.strictEqual(observed.length, observedFirst,
    `…nor 20 more calibration observations (got ${observed.length}, was ${observedFirst})`);
});

test("…and it stays hidden across those re-renders", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(102, `<div>${SLOP}</div>`))));
  const { s } = harness();
  feed.scan(doc, [], s);
  const slopEl = () => doc.querySelector('[data-urn="urn:li:activity:102"]');
  assert.ok(slopEl().classList.contains("feedhacker-hidden"), "hidden initially");
  rerender(doc);
  feed.scan(doc, [], s);
  assert.ok(slopEl().classList.contains("feedhacker-hidden"), "the verdict is re-applied to the new node");
  assert.strictEqual(slopEl().dataset.feedhackerRepeat, "1", "…and marked as a repeat, not a fresh judgement");
});

test("the activity URN identifies the post, so two real posts are two posts", () => {
  // Same text, different URNs — a repost and its original, say. Both must be judged.
  const doc = makeDoc(feedHtml(post(201, `<div>${SLOP}</div>`) + post(202, `<div>${SLOP}</div>`)));
  const { s, decisions } = harness();
  feed.scan(doc, [], s);
  assert.strictEqual(decisions.length, 2, "distinct URNs are distinct posts");
});

test("without a URN, identical markup is treated as the same post", () => {
  // The safe degradation: byte-identical markup is overwhelmingly a re-render, and the verdict
  // applied is the same either way.
  const doc = makeDoc(feedHtml(withNeighbour(post(null, `<div>${SLOP}</div>`) + post(null, `<div>${SLOP}</div>`))));
  const { s, decisions } = harness();
  feed.scan(doc, [], s);
  assert.strictEqual(decisions.length, 1, "one identity, one decision");
  const slop = [...doc.querySelectorAll(".post")].filter((e) => !e.hasAttribute("data-urn"));
  assert.strictEqual(slop.length, 2, "two URN-less slop posts in the fixture");
  slop.forEach((el, i) => assert.ok(el.classList.contains("feedhacker-hidden"), `both still hidden (post ${i})`));
});

test("'Show anyway' survives a re-render", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(301, `<div>${SLOP}</div>`))));
  const { s } = harness();
  feed.scan(doc, [], s);
  doc.querySelector('[data-fh-act="show"]')
     .dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
  const shownEl = () => doc.querySelector('[data-urn="urn:li:activity:301"]');
  assert.ok(!shownEl().classList.contains("feedhacker-hidden"), "revealed");

  rerender(doc);
  feed.scan(doc, [], s);
  assert.ok(!shownEl().classList.contains("feedhacker-hidden"),
    "a re-render must not undo the user's choice");
});

// --- FH-050: fragments ---------------------------------------------------------------
test("a fragment is observed for calibration but never hidden on", () => {
  // Reproduces the real failure. Both of these score ABOVE the log's own calibrated cutoff
  // (its per-decision thresholds were 0.428-0.471, well under the 0.5 default), purely on
  // layout: the jobs module hits broetry 1.00, the emoji strip hits emoji 1.00 + bullets 1.00.
  // Neither is prose, and neither should ever be hidden as an AI-slop POST.
  const JOBS = `Jobs recommended for you\nManaging Partner\nAcme Corp\nSenior Engineer\nBeta Inc\nView all`;
  const EMOJI = `🚀\n💡\n🔥\n✨\n🎯`;
  const doc = makeDoc(feedHtml(
    withNeighbour(post(401, `<div>${JOBS}</div>`) + post(402, `<div>${EMOJI}</div>`))));
  const { s, observed } = harness({ slopThreshold: 0.43 });
  feed.scan(doc, [], s);
  [401, 402].forEach((u) => assert.ok(
    !doc.querySelector(`[data-urn="urn:li:activity:${u}"]`).classList.contains("feedhacker-hidden"),
    `fragment ${u} must not be hidden`));
  assert.ok(observed.length >= 2,
    "fragments are still observed — their shape is part of what this feed contains");
});

test("a real post is still long enough to judge", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(403, `<div>${SLOP}</div>`))));
  const { s } = harness();
  feed.scan(doc, [], s);
  assert.ok(doc.querySelector('[data-urn="urn:li:activity:403"]').classList.contains("feedhacker-hidden"),
    "the fragment gate must not blunt real detection");
});

test("muting an author re-judges their posts, despite an earlier 'keep' verdict", () => {
  // The verdict ledger must not outlive the rules it was reached under. A preserving re-apply
  // (reset(doc, true) + rescan) is what runs after a settings or author change, so a
  // model-derived "keep" from before the mute has to be discarded — otherwise the newly muted
  // author's posts sail straight through. The system tier caught this; it belongs here.
  const authors = require("../../build/authors.js");
  const doc = makeDoc(feedHtml(withNeighbour(
    post(501, `<div><a href="/in/ann-author">Ann Author</a> ${HUMAN}</div>`))));
  const { s } = harness();
  s.authors = {};
  feed.scan(doc, [], s);
  const ann = () => doc.querySelector('[data-urn="urn:li:activity:501"]');
  assert.ok(!ann().classList.contains("feedhacker-gone"), "kept on the first pass — nothing muted yet");

  s.authors = authors.mute({}, "/in/ann-author", "Ann Author");
  s.authorMutesActive = true;
  feed.reset(doc, true);          // exactly what onMuteAuthor does
  feed.scan(doc, [], s);
  assert.ok(ann().classList.contains("feedhacker-gone"),
    "the mute must take effect, not be shadowed by the stale verdict");
});

test("…but a preserving re-apply keeps the user's own choices", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(502, `<div>${SLOP}</div>`))));
  const { s } = harness();
  feed.scan(doc, [], s);
  doc.querySelector('[data-urn="urn:li:activity:502"] [data-fh-act="show"]')
     .dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));

  feed.reset(doc, true);
  feed.scan(doc, [], s);
  assert.ok(!doc.querySelector('[data-urn="urn:li:activity:502"]').classList.contains("feedhacker-hidden"),
    "'Show anyway' survives a settings change");
});
