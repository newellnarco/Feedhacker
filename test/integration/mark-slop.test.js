"use strict";
// FH-062 — telling the model it MISSED one.
//
// Every FeedHacker control lived inside a stub, and a stub only exists once a post is hidden.
// So "Show anyway" could say *wrong to hide this* (label 0) and nothing could say *you missed
// this one* (label 1) about a post that was shown. On a model that also auto-tunes toward
// hiding ~slopTargetFrac of what it reviews, only one direction of correction was reachable —
// and it was the direction that hides less. The maintainer, 2026-09-17:
//
//   "I'd like to be able to click slop on posts it shows by default. or remove a post that was
//    selected as slop and help model learn what its hiding that isn't slop so the learning
//    goes both ways."
//
// The second half already worked; this is the first half.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
// Plainly human, comfortably long enough to judge, and scores well under the threshold — this
// is the post the model shows and the user disagrees about.
const HUMAN =
  "Fixed a caching bug this morning: the key included a timestamp, so every lookup missed and " +
  "we were hammering the database on every page load. Tests pass and I am shipping the patch " +
  "after lunch, then writing up what we learned about cache keys for the team wiki.";
const SHORT = "Shipped it.";

let urnSeq = 0;
function post(inner, opts) {
  const o = opts || {};
  const urn = o.urn === false ? "" : ` data-urn="urn:li:activity:${++urnSeq}"`;
  return `<div class="post"${urn}><h2>Feed post</h2>${inner}</div>`;
}
function feedHtml(body) { return `<!doctype html><html><body><main><div id="feed">${body}</div></main></body></html>`; }
// findPostContainers walks UP from each "Feed post" marker to the first ancestor holding more
// than one marker. With a single post in the fixture there is no such ancestor, so it walks to
// <html> and the whole document becomes "the post" — which silently makes assertions pass or
// fail for the wrong reason. Every fixture therefore carries a second, plainly-human post.
const NEIGHBOUR = "Deployed the new indexer to staging this afternoon and the p99 came down a lot, so I am writing up the numbers tomorrow.";
function withNeighbour(body) { return body + post(`<div>${NEIGHBOUR}</div>`); }
// The mark inside a specific post element, rather than by document-wide selector.
const markIn = (el) => el.querySelector('[data-fh-act="mark-slop"]');

function harness(over) {
  const labels = [], verdicts = [], decisions = [], observed = [], outcomes = [];
  const s = Object.assign({}, filters.DEFAULTS,
    { slopWeights: scorer.defaultWeights(), groupHiddenRuns: false, muteSloppy: true }, over || {});
  s.onFeedback = (feats, label) => labels.push({ feats, label });
  s.onSlopVerdict = (id, label, feats) => verdicts.push({ id, label, feats });
  s.onSlopDecision = (d) => decisions.push(d);
  s.onSlopObserve = (f) => observed.push(f);
  s.onAuthorOutcome = (info, hidden) => outcomes.push({ info, hidden });
  s.onMuteAuthor = () => {}; s.onAllowAuthor = () => {}; s.onInteract = () => {};
  return { s, labels, verdicts, decisions, observed, outcomes };
}
const click = (doc, el) => el.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
// Same re-render the FH-049 tests model: LinkedIn rebuilds the subtree from its own state, so
// the new node carries none of our attributes, classes or injected nodes.
function rerender(doc) {
  const f = doc.getElementById("feed");
  f.querySelectorAll(".feedhacker-stub, .feedhacker-mark").forEach((n) => n.remove());
  f.querySelectorAll("*").forEach((n) => {
    n.classList.remove("feedhacker-hidden", "feedhacker-gone", "feedhacker-dismissing");
    if (!n.classList.length) n.removeAttribute("class");
    [...n.attributes].forEach((a) => { if (a.name.startsWith("data-feedhacker")) n.removeAttribute(a.name); });
  });
  f.innerHTML = f.innerHTML;
}

test("a post FeedHacker chose to show offers 'this is AI slop'", () => {
  const doc = makeDoc(feedHtml(post(`<div>${HUMAN}</div>`) + post(`<div>${SLOP}</div>`)));
  const { s } = harness();
  feed.scan(doc, [], s);
  const posts = feed.findPostContainers(doc);
  assert.ok(!posts[0].classList.contains("feedhacker-hidden"), "the human post is shown");
  assert.ok(posts[0].querySelector('[data-fh-act="mark-slop"]'), "…and carries the mark control");
  // The hidden one has a stub with the existing splat; it must not also grow a mark bar.
  assert.ok(posts[1].classList.contains("feedhacker-hidden"), "the slop post is hidden");
  assert.strictEqual(posts[1].querySelector(".feedhacker-mark"), null,
    "a hidden post has its stub — a second control above it would be nonsense");
});

test("clicking it trains label 1, records the decision, and hides the post", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(`<a href="/in/dee-four">Dee Four</a><div>${HUMAN}</div>`))));
  const { s, labels, verdicts, decisions, outcomes } = harness();
  feed.scan(doc, [], s);
  const el = feed.findPostContainers(doc)[0];
  click(doc, markIn(feed.findPostContainers(doc)[0]));

  assert.strictEqual(labels.length, 1, "one training signal");
  assert.strictEqual(labels[0].label, 1, "…and it is POSITIVE — the missing direction");
  assert.ok(labels[0].feats && typeof labels[0].feats.broetry === "number",
    "trained on the real feature vector, not an empty object");
  assert.deepStrictEqual(verdicts.map((v) => v.label), [1], "the decision log gets the verdict too");
  assert.strictEqual(decisions.length, 1, "a decision is logged for a post the model itself never flagged");
  assert.ok(decisions[0].prob < (decisions[0].threshold || 0.5),
    "and it records the probability the model DID give it — how far off it was");
  assert.ok(el.classList.contains("feedhacker-hidden"), "the post is hidden, like any slop post");
  assert.ok(el.querySelector(".feedhacker-stub"), "…with a normal stub");
  assert.strictEqual(el.querySelector(".feedhacker-mark"), null, "the mark is gone with the post");
  assert.deepStrictEqual(outcomes.map((o) => o.hidden), [true], "counted as a hide for this author");
});

test("…and 'Show anyway' is the undo, without re-hiding on the next scan", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(`<div>${HUMAN}</div>`))));
  const { s } = harness();
  feed.scan(doc, [], s);
  click(doc, markIn(feed.findPostContainers(doc)[0]));
  const el = () => feed.findPostContainers(doc)[0];
  assert.ok(el().classList.contains("feedhacker-hidden"), "hidden by the mark");

  click(doc, doc.querySelector('[data-fh-act="show"]'));
  assert.ok(!el().classList.contains("feedhacker-hidden"), "revealed");
  feed.scan(doc, [], s);
  assert.ok(!el().classList.contains("feedhacker-hidden"),
    "a later scan must not undo the user's reveal — the mark is a user verdict, not a model one");
});

test("one click trains once, even though collapse() rebuilds the subtree under it", () => {
  const doc = makeDoc(feedHtml(withNeighbour(post(`<div>${HUMAN}</div>`))));
  const { s, labels } = harness();
  feed.scan(doc, [], s);
  const btn = markIn(feed.findPostContainers(doc)[0]);
  click(doc, btn);
  click(doc, btn);                       // the same button again, if it still exists
  feed.scan(doc, [], s);
  assert.deepStrictEqual(labels.map((l) => l.label), [1], "exactly one positive signal");
});

test("the control survives a LinkedIn re-render — WITHOUT re-judging the post", () => {
  // The trap: the vector lives on the node, LinkedIn replaces nodes, and re-scoring to get it
  // back is precisely the flood the verdict ledger exists to prevent (FH-049/FH-060). It is
  // carried in the ledger instead.
  const doc = makeDoc(feedHtml(post(`<div>${HUMAN}</div>`) + post(`<div>${SLOP}</div>`)));
  const { s, decisions, observed } = harness();
  feed.scan(doc, [], s);
  const decisionsAfterFirst = decisions.length, observedAfterFirst = observed.length;
  assert.ok(markIn(feed.findPostContainers(doc)[0]), "present on the first scan");

  for (let i = 0; i < 5; i++) { rerender(doc); feed.scan(doc, [], s); }
  assert.ok(markIn(feed.findPostContainers(doc)[0]), "still offered after five re-renders");
  assert.strictEqual(decisions.length, decisionsAfterFirst, "no fresh decisions were logged");
  assert.strictEqual(observed.length, observedAfterFirst, "no fresh calibration observations");

  // …and it still works after the re-render, on the vector the ledger carried.
  const { labels } = { labels: [] };
  s.onFeedback = (feats, label) => labels.push({ feats, label });
  click(doc, markIn(feed.findPostContainers(doc)[0]));
  assert.strictEqual(labels.length, 1, "the restored vector is usable");
  assert.strictEqual(labels[0].label, 1);
  assert.ok(typeof labels[0].feats.broetry === "number", "a real vector, not an empty one");
});

test("a post too short to judge offers nothing — a fragment is not training data", () => {
  // FH-050's lesson in the other direction: every tell is a density or shape measure, so on a
  // fragment they saturate on noise. Training on that pollutes the model just as hiding on it
  // pollutes the feed.
  const doc = makeDoc(feedHtml(post(`<div>${SHORT}</div>`) + post(`<div>${HUMAN}</div>`)));
  const { s } = harness();
  feed.scan(doc, [], s);
  const posts = feed.findPostContainers(doc);
  assert.strictEqual(posts[0].querySelector(".feedhacker-mark"), null, "no mark on the fragment");
  assert.ok(posts[1].querySelector('[data-fh-act="mark-slop"]'), "…but the real post still has one");
});

test("LinkedIn's own feed modules offer nothing either", () => {
  // FH-053: the platform's modules wear the same hidden "Feed post" heading a real post does.
  // They are not posts, so they are not the user's to label.
  const doc = makeDoc(feedHtml(
    post(`<div>Who's viewed your profile</div><div><a href="/in/steve-hawkins">Steve Hawkins</a> - 1st Director of Security</div>`) +
    post(`<div>${HUMAN}</div>`)));
  const { s } = harness();
  feed.scan(doc, [], s);
  const posts = feed.findPostContainers(doc);
  const furniture = posts.find((p) => /viewed your profile/.test(p.textContent));
  assert.ok(furniture, "the module is in the fixture");
  assert.strictEqual(furniture.querySelector(".feedhacker-mark"), null, "furniture is not labelable");
});

test("with the AI-slop filter off there is nothing to teach, so no control", () => {
  const doc = makeDoc(feedHtml(post(`<div>${HUMAN}</div>`) + post(`<div>${SLOP}</div>`)));
  const { s } = harness({ muteSloppy: false, mutePromoted: true });
  feed.scan(doc, [], s);
  assert.strictEqual(doc.querySelector(".feedhacker-mark"), null,
    "no model is running — offering to train one would be a lie");
});

test("a preserving re-apply keeps a marked post hidden", () => {
  // reset(doc, true) drops model-derived verdicts on purpose. The mark is the USER's verdict,
  // so it has to survive — otherwise a settings change resurrects a post they just removed.
  const doc = makeDoc(feedHtml(withNeighbour(post(`<div>${HUMAN}</div>`))));
  const { s } = harness();
  feed.scan(doc, [], s);
  click(doc, markIn(feed.findPostContainers(doc)[0]));
  assert.ok(feed.findPostContainers(doc)[0].classList.contains("feedhacker-hidden"), "hidden");

  feed.reset(doc, true);
  feed.scan(doc, [], s);
  assert.ok(feed.findPostContainers(doc)[0].classList.contains("feedhacker-hidden"),
    "still hidden after a settings re-apply");
});
