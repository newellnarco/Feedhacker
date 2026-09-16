"use strict";
// Integration: LinkedIn's own feed modules are not posts (FH-053).
//
// "Who's viewed your profile" and "Jobs recommended for you" wear the same hidden
// <h2>Feed post</h2> heading a real post does, so findPostContainers() hands them to the scan
// and FeedHacker judged, author-attributed and hid them as if a member had written them — the
// 2026-09-15 capture attributed one to "Jobs recommended for youVice President, Apps".
//
// FH-050 already stopped a module being hidden as AI SLOP (it requires 20 words of prose), but
// solo and mute have no such gate, so on a soloed feed the modules were hidden as ordinary
// posts. These cases drive the paths FH-050 does not cover.
//
// The guard is deliberately conservative and fails CLOSED, because the costs are asymmetric:
// missing a module only preserves today's behaviour, while mistaking a real post for a module
// would silently exempt it from filtering. Both signals must agree — a known module heading AND
// no per-post overflow control. The last two tests are the ones that pin that down.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

function baseSettings(over) {
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() }, over || {});
}
function feedHtml(b) { return `<!doctype html><html><body><main><div id="feed">${b}</div></main></body></html>`; }

const HUMAN = "Fixed a caching bug this morning, tests pass, shipping the patch after lunch.";

// A real member post, as LinkedIn's current feed renders it: hidden marker heading plus the
// per-post overflow control that every genuine post carries.
let n = 0;
function post(text, author) {
  author = author || "Avery Lindqvist";
  return `<div class="post"><h2>Feed post</h2>` +
    `<button aria-label="Open control menu for post by ${author}"></button>` +
    `<div>${text} #${++n}</div></div>`;
}
// A real post that a mute WILL hide (Promoted), so "the guard did not switch filtering off"
// can actually be asserted. Solo used to hide everything, which made this trivial; with mute
// the post has to genuinely match a muted kind.
function adPost(text, author) {
  author = author || "Acme Corp";
  return `<div class="post"><h2>Feed post</h2>` +
    `<button aria-label="Open control menu for post by ${author}"></button>` +
    `<a href="https://www.linkedin.com/company/acme">Acme</a><span>Promoted</span>` +
    `<div>${text} #${++n}</div></div>`;
}
// A LinkedIn feed module: same marker heading, and NO overflow control.
function module_(heading, body) {
  return `<div class="mod"><h2>Feed post</h2><div>${heading}</div><div>${body}</div></div>`;
}

// The profile link matters: without it authorInfo() resolves no author and the muted-author
// case below would pass for the wrong reason. LinkedIn's real module does carry one.
const VIEWED = module_("Who's viewed your profile",
  '<a href="https://www.linkedin.com/in/steve-hawkins/">Steve Hawkins</a> • 1st Director of Security Architecture');
const JOBS = module_("Jobs recommended for you", "Vice President, Apps (Verified job) Vancouver");

// postContainerFor() walks up from a marker until it finds a parent holding MORE than one, so
// a document with a single marker resolves its "container" to the document root. Every case
// below therefore keeps at least two markers on the page, as a real feed always does.
const FILLER = () => post(HUMAN);

// Mute on "promoted" is the path that hid the modules in the real capture (solo, which did the
// same thing more aggressively, was removed in 0.8.0) — and the one FH-050's prose gate never
// sees. The module carries "Promoted"-free text, so only the guard keeps it visible.
function soloSettings(over) {
  return baseSettings(Object.assign({ muteCompany: true, muteHiring: true, mutePromoted: true }, over || {}));
}

test("a mute hides real posts but leaves LinkedIn's own modules alone", () => {
  const doc = makeDoc(feedHtml(VIEWED + adPost("buy our thing") + JOBS));
  feed.scan(doc, [], soloSettings());

  const mods = doc.querySelectorAll(".mod");
  for (const m of mods) {
    assert.notStrictEqual(m.dataset.feedhackerHidden, "1", "a LinkedIn module must never be hidden");
    assert.strictEqual(m.dataset.feedhackerFurniture, "1", "and must be recognised as furniture");
  }
  assert.strictEqual(doc.querySelector(".post").dataset.feedhackerHidden, "1",
    "the real post is still filtered — the guard must not switch filtering off");
});

test("a module is never author-attributed, so it cannot pollute author history", () => {
  // The real capture produced the author "Jobs recommended for youVice President, Apps".
  const doc = makeDoc(feedHtml(JOBS + FILLER()));
  const seen = [];
  feed.scan(doc, [], soloSettings({ onAuthorOutcome(info) { seen.push(info && info.name); } }));

  const mod = doc.querySelector(".mod");
  assert.strictEqual(mod.dataset.feedhackerActor, undefined, "no author is stashed on a module");
  assert.deepStrictEqual(seen, [], "and no author outcome is recorded for one");
});

test("a muted author cannot be matched out of a module's text", () => {
  // Mute is the other ungated path: it runs BEFORE solo and before FH-050's prose gate, and it
  // hides outright with no stub. "Who's viewed your profile" lists people, each with a real
  // profile link, so the module resolves to a person — mute one of them and without the guard
  // the whole module vanishes as though they had posted it. The key is the one keyFor() builds
  // from the profile URL, not the display name; using the wrong shape here would make this
  // pass for the wrong reason.
  const { authors } = require("../helper");
  const key = authors.keyFor({ name: "Steve Hawkins", url: "https://www.linkedin.com/in/steve-hawkins/" });
  const muted = {}; muted[key] = 1;

  const doc = makeDoc(feedHtml(VIEWED + FILLER()));
  feed.scan(doc, [], baseSettings({ authors: { muted, allowed: {} }, authorMutesActive: true }));

  assert.notStrictEqual(doc.querySelector(".mod").dataset.feedhackerHidden, "1",
    "someone listed inside a module is not that module's author");
});

test("FAILS CLOSED: a real post that merely opens with a module heading is still filtered", () => {
  // Someone writing "People you may know..." is still a post — it has an overflow control, and
  // one signal alone must never be enough to exempt it.
  const doc = makeDoc(feedHtml(adPost("People you may know are hiring right now. " + HUMAN) + FILLER()));
  feed.scan(doc, [], soloSettings());
  const el = doc.querySelector(".post");
  assert.notStrictEqual(el.dataset.feedhackerFurniture, "1", "it is a post, not furniture");
  assert.strictEqual(el.dataset.feedhackerHidden, "1", "so the Promoted mute still hides it");
});

test("FAILS CLOSED: an UNRECOGNISED module is scanned exactly as before", () => {
  // The heading list is short on purpose. Anything not on it keeps today's behaviour rather
  // than being waved through — guessing wide would exempt real posts from filtering.
  const doc = makeDoc(feedHtml(module_("Today's top courses for you", "Learn TypeScript in 4 hours") + FILLER()));
  feed.scan(doc, [], soloSettings());
  const el = doc.querySelector(".mod");
  assert.notStrictEqual(el.dataset.feedhackerFurniture, "1", "not claimed as furniture");
  assert.strictEqual(el.dataset.feedhackerScanned, "1",
    "it goes through the ordinary post path, exactly as before the guard existed");
});

test("isFurniture needs BOTH signals — neither alone is enough", () => {
  const withControl = makeDoc(feedHtml(post("Who's viewed your profile lately? " + HUMAN) + FILLER()));
  const el = withControl.querySelector(".post");
  assert.strictEqual(feed.isFurniture(el, feed.getText(el)), false,
    "module heading + an overflow control = a real post");

  const noHeading = makeDoc(feedHtml(module_("Something else entirely", "body text") + FILLER()));
  const el2 = noHeading.querySelector(".mod");
  assert.strictEqual(feed.isFurniture(el2, feed.getText(el2)), false,
    "no overflow control alone = not enough to claim furniture");

  const real = makeDoc(feedHtml(VIEWED + FILLER()));
  const el3 = real.querySelector(".mod");
  assert.strictEqual(feed.isFurniture(el3, feed.getText(el3)), true, "both signals = furniture");
});
