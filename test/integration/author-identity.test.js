"use strict";
// FH-043: who "Mute" actually mutes.
//
// authorInfo() used to be re-derived from the live DOM at CLICK time — but by then the post
// is collapsed, and `.feedhacker-hidden > *:not(.feedhacker-stub) { display: none }` means
// el.innerText is now our own stub's text. getActor read that back, so Mute stored a key like
// "name:ai slopshowanyway…" that can never match a real post: the row slid away, nothing was
// muted, and the author kept showing up. Separately, on a reshare the reactor's profile link
// comes first in document order, so the anchor-based key pointed at the reactor, not the author.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, authors, makeDoc } = require("../helper");

const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
const HUMAN = "Fixed a caching bug this morning, tests pass, shipping the patch after lunch.";

function feedHtml(bodyHtml) {
  return `<!doctype html><html><body><main><div id="feed">${bodyHtml}</div></main></body></html>`;
}
function post(inner) { return `<div class="post"><h2>Feed post</h2>${inner}</div>`; }

// A store-backed settings object wired the way content.ts wires it.
function muteHarness(over) {
  const s = Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() }, over || {});
  const state = { store: {}, keys: [] };
  s.authors = state.store;
  s.onFeedback = () => {};
  s.onSlopDecision = () => {};
  s.onSlopVerdict = () => {};
  s.onAuthorOutcome = () => {};
  s.onAllowAuthor = () => {};
  s.onMuteAuthor = (info) => {
    const key = authors.keyFor(info);
    state.keys.push(key);
    state.store = authors.mute(state.store, key, info && info.name);
    s.authors = state.store;
    s.authorMutesActive = true;
  };
  return { s, state };
}
function clickMute(doc, el) {
  const btn = el.querySelector('[data-fh-act="mute"]');
  assert.ok(btn, "the stub offers a Mute control");
  btn.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
}

test("Mute keys on the author captured while the post was visible, not the collapsed stub", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/carl-coder">Carl Coder</a><div>${SLOP}</div>`)));
  const { s, state } = muteHarness({ groupHiddenRuns: false });
  feed.scan(doc, [], s);

  const el = feed.findPostContainers(doc)[0];
  assert.strictEqual(el.dataset.feedhackerActorUrl, "https://www.linkedin.com/in/carl-coder",
    "the author's profile URL is stashed at scan time");

  clickMute(doc, el);
  assert.deepStrictEqual(state.keys, ["/in/carl-coder"], "mute keys on the author's profile path");
});

test("a muted author's later posts are hidden outright, with no stub", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/carl-coder">Carl Coder</a><div>${SLOP}</div>`)));
  const { s, state } = muteHarness({ groupHiddenRuns: false });
  feed.scan(doc, [], s);
  clickMute(doc, feed.findPostContainers(doc)[0]);

  // A fresh page-load's worth of feed, carrying a perfectly ordinary post by the same author.
  const later = makeDoc(feedHtml(
    post(`<a href="/in/carl-coder">Carl Coder</a><div>${HUMAN}</div>`) +
    post(`<a href="/in/dana-dev">Dana Dev</a><div>${HUMAN}</div>`)
  ));
  const s2 = Object.assign({}, s, { authors: state.store, authorMutesActive: true });
  feed.scan(later, [], s2);

  const [carl, dana] = feed.findPostContainers(later);
  assert.strictEqual(carl.dataset.feedhackerHidden, "1", "the muted author's post is hidden");
  assert.ok(carl.classList.contains("feedhacker-gone"), "…outright — a soft block, not a stub");
  assert.strictEqual(carl.querySelector(".feedhacker-stub"), null, "no placeholder is left behind");
  assert.ok(!dana.classList.contains("feedhacker-gone"), "an unmuted author is untouched");
});

test("on a reshare, Mute takes the author — not the connection who surfaced it", () => {
  // LinkedIn puts the reactor's link FIRST: "Rita Reactor likes this", then the real post.
  // The trailing spaces stand in for the line breaks a browser's innerText puts between
  // these blocks — jsdom has no layout, so textContent would otherwise run them together.
  const doc = makeDoc(feedHtml(post(
    `<div><a href="/in/reactor-rita">Rita Reactor</a> likes this </div>` +
    `<div><a href="/in/author-alice">Alice Author</a> </div>` +
    `<div>${SLOP}</div>`
  )));
  const { s, state } = muteHarness({ groupHiddenRuns: false });
  feed.scan(doc, [], s);
  clickMute(doc, feed.findPostContainers(doc)[0]);

  assert.deepStrictEqual(state.keys, ["/in/author-alice"], "the ORIGINAL author is muted");
  assert.ok(!authors.isMuted(state.store, "/in/reactor-rita"), "the reactor is not");

  const later = makeDoc(feedHtml(post(`<a href="/in/author-alice">Alice Author</a><div>${HUMAN}</div>`)));
  const s2 = Object.assign({}, s, { authors: state.store, authorMutesActive: true });
  feed.scan(later, [], s2);
  assert.ok(feed.findPostContainers(later)[0].classList.contains("feedhacker-gone"),
    "so Alice's next post really does stay out of the feed");
});

test("a full reset clears the stashed author identity", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/carl-coder">Carl Coder</a><div>${SLOP}</div>`)));
  const { s } = muteHarness({ groupHiddenRuns: false });
  feed.scan(doc, [], s);
  const el = feed.findPostContainers(doc)[0];
  assert.ok(el.dataset.feedhackerActorUrl, "stashed while scanning");

  feed.reset(doc);
  assert.strictEqual(el.dataset.feedhackerActorUrl, undefined, "and cleared with the rest of our state");
});
