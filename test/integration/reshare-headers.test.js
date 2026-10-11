"use strict";
// FH-073: LinkedIn's 2026-10 feed surfaces other people's posts under two headers FeedHacker
// did not know — "X commented" (the old wording was "commented on this") and "Followed by X"
// (a stranger's post, shown because a connection follows them) — and a third it misread,
// "X follows this page". All three shapes are transcribed from the maintainer's live
// home-feed capture of 2026-10-11, names replaced. On that capture 6 of the 9 posts left
// showing carried one of these headers, and every one was attributed to the connection in
// the header rather than the author — so Mute muted the wrong person.
//
// jsdom has no innerText, so the trailing spaces stand in for the line breaks a browser puts
// between these blocks (the real head reads "Followed by Pete P Angie A • 2nd …").
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, authors, makeDoc } = require("../helper");

function feedHtml(body) { return `<!doctype html><html><body><main><div id="feed">${body}</div></main></body></html>`; }
function post(inner) { return `<div class="post"><h2>Feed post</h2>${inner}</div>`; }
const BODY = `<div>When I was young I saw a strange swirling light over our family farm. </div>`;
function one(inner) { return feed.findPostContainers(makeDoc(feedHtml(post(inner))))[0]; }

const FOLLOWED_BY = `<div>Followed by </div><a href="/in/pete-follower"></a><a href="/in/pete-follower">Pete Follower </a>` +
  `<a href="/in/angie-author"></a><a href="/in/angie-author">Angie Author • 2nd </a><div>AI Advisor · Keynote Speaker </div><div>Oct 7 </div>${BODY}`;
const COMMENTED = `<a href="/in/mike-commenter"></a><a href="/in/mike-commenter">Mike Commenter </a><div>commented </div>` +
  `<a href="/in/yan-author"></a><a href="/in/yan-author">Yan Author • 2nd </a><div>National Director </div><div>2h </div>${BODY}`;
const FOLLOWS_PAGE = `<a href="/company/rescue"></a><a href="/in/anne-follower"></a><a href="/in/anne-follower">Anne Follower </a>` +
  `<div>follows this page </div><a href="/company/rescue"></a><a href="/company/rescue">Rescue Co </a><div>3,189 followers </div>` +
  `<div>Promoted </div><div>Your stack automated the easy part. </div>`;

test("'Followed by X' is a reaction reshare, and the author is the post's writer, not X", () => {
  const el = one(FOLLOWED_BY);
  assert.strictEqual(feed.isReactionReshare(el), true);
  assert.strictEqual(feed.getActor(el), "Angie Author");
  assert.strictEqual(feed.authorInfo(el).url, "https://www.linkedin.com/in/angie-author");
});

test("'X commented' (no 'on this') is a reaction reshare, and the author is not the commenter", () => {
  const el = one(COMMENTED);
  assert.strictEqual(feed.isReactionReshare(el), true);
  assert.strictEqual(feed.getActor(el), "Yan Author");
  assert.strictEqual(feed.authorInfo(el).url, "https://www.linkedin.com/in/yan-author");
});

test("'X follows this page' names the page, not 'page <name> <n> followers Promoted …'", () => {
  const el = one(FOLLOWS_PAGE);
  assert.strictEqual(feed.isReactionReshare(el), true);
  assert.strictEqual(feed.getActor(el), "Rescue Co");
  assert.strictEqual(feed.isCompanyAuthor(el), true);
});

test("the original 'X likes this' header still reads the same", () => {
  const el = one(`<a href="/in/rita"></a><a href="/in/rita">Rita Reactor </a><div>likes this </div>` +
    `<a href="/in/alice">Alice Author • 3rd+ </a>${BODY}`);
  assert.strictEqual(feed.isReactionReshare(el), true);
  assert.strictEqual(feed.getActor(el), "Alice Author");
});

// The loose form is bare "commented", so these are the fail-closed controls: an ordinary
// post that SAYS "commented" or "followed by" must not be hidden as a reshare.
test("an ordinary post that mentions 'commented' or 'followed by' in its body is not a reshare", () => {
  const person = one(`<a href="/in/jane">Jane Doe • 2nd </a><div>Engineer </div>` +
    `<div>I commented on a thread yesterday and got followed by a recruiter. </div>`);
  assert.strictEqual(feed.isReactionReshare(person), false);
  assert.strictEqual(feed.getActor(person), "Jane Doe");

  const company = one(`<a href="/company/acme">Acme </a><div>3,189 followers </div><div>Promoted </div>` +
    `<div>We commented on the new rules. </div>`);
  assert.strictEqual(feed.isReactionReshare(company), false);
  assert.strictEqual(feed.getActor(company), "Acme");
});

test("with Reaction reshares muted, all three new headers are hidden — and Mute takes the author", () => {
  const doc = makeDoc(feedHtml(post(FOLLOWED_BY) + post(COMMENTED) + post(FOLLOWS_PAGE)));
  const muted = [];
  const s = Object.assign({}, filters.DEFAULTS, { muteLikes: true, slopWeights: scorer.defaultWeights(),
    groupHiddenRuns: false, authors: {} });
  s.onFeedback = s.onSlopDecision = s.onSlopVerdict = s.onAuthorOutcome = s.onAllowAuthor = () => {};
  s.onMuteAuthor = (info) => muted.push(authors.keyFor(info));
  feed.scan(doc, [], s);
  const els = feed.findPostContainers(doc);
  els.forEach((el, i) => assert.ok(el.classList.contains("feedhacker-hidden"), `post ${i} hidden as a reshare`));
  els.forEach((el) => el.querySelector('[data-fh-act="mute"]').dispatchEvent(
    new el.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })));
  assert.deepStrictEqual(muted, ["/in/angie-author", "/in/yan-author", "/company/rescue"]);
});
