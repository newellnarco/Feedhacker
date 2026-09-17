"use strict";
// FH-060 — the AI-slop decision log and the calibration population were both being flooded,
// in 0.8.0, with the same handful of posts. From the maintainer's real export (0.8.0,
// 2026-09-17):
//
//   300 decisions ... but only 5 DISTINCT posts (87 / 87 / 86 / 26 / 14 by author)
//   all 300 inside 140 seconds; median gap between re-judgements 1548ms
//   ...and IDENTICAL to the millisecond across all three top posts (one clock drove them)
//   189 observations -> 12 distinct feature vectors, each repeated 14-29 times
//   the feature vectors were byte-identical repeats, so the scored TEXT never changed
//   auto-calibration then read broetry as firing on 76.75% of "posts" and damped it
//   1.400 -> 0.792, bullets 0.900 -> 0.516, and pushed the threshold 0.500 -> 0.570
//
// Root cause was a self-sustaining loop entirely inside one tab:
//
//   consider() hides a post -> recordOutcome -> onAuthorOutcome bumps the author's hide
//   tally -> saveAuthorsSoon() writes feedhacker:authors after 1500ms -> OUR OWN tab's
//   storage.onChanged fires -> the AUTHORS_KEY branch called reapply() -> reset(doc, true),
//   which deliberately drops every model-derived verdict -> scanNow() re-judges the whole
//   feed -> hides posts -> bumps tallies -> ...
//
// Nothing about it needed the user to scroll, and the ledger that FH-049 added to make a
// re-render silent could not help: the ledger was being emptied on every turn of the loop.
// The 1.5s cadence in the log is that debounce.
//
// The fix: the mute/allow RULES decide whether a store change re-applies the feed. Tallies
// are Insights data and change nothing about filtering, so a tally-only write is inert —
// while a genuine mute from the options page still re-applies at once.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

const EXT_ID = "feedhacker-ext-id";
const AUTHORS_KEY = "feedhacker:authors";
const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
const FEED = `<!doctype html><html><body><main><div id="feed">
  <div class="post" id="p-slop"><h2>Feed post</h2><a href="/in/slop-author">Slop Author</a><div>${SLOP}</div></div>
  <div class="post" id="p-ok"><h2>Feed post</h2><a href="/in/ok-author">Ok Author</a><div>Fixed a caching bug this morning, tests pass, shipping later.</div></div>
</div></main></body></html>`;

const dom = new JSDOM(FEED, { url: "https://www.linkedin.com/feed/" });
const changeListeners = [];

global.self = global;
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
global.setInterval = () => 0;        // silence the 8s heartbeat
global.clearInterval = () => {};
global.setTimeout = () => 0;         // debounced writers stay inert; we deliver the write ourselves

global.chrome = {
  runtime: { id: EXT_ID, getURL: (p) => p, sendMessage: () => {} },
  storage: {
    sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, { muteSloppy: true })) },
    local: { get: (keys, cb) => cb({}), set: (obj, cb) => { if (cb) cb(); } },
    onChanged: { addListener: (fn) => changeListeners.push(fn) },
  },
};

for (const m of ["filters", "logger", "selectors", "matcher", "scorer", "authors", "customfilters", "feed"]) {
  require(`../../build/${m}.js`);
}
const feed = global.self.FeedHackerFeed;
const authors = global.self.FeedHackerAuthors;
require("../../build/content.js");

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }

// content.js calls `F.reset(document, true)` — a property lookup on the module object at
// call time — so counting calls here counts exactly the re-applies the loop was driving.
let resets = 0;
const realReset = feed.reset;
feed.reset = function (...args) { resets++; return realReset.apply(this, args); };

// A store as the tab itself writes one: the same rules, one more hide counted.
function withTally(store, key, n) {
  let s = store;
  for (let i = 0; i < n; i++) s = authors.record(s, key, "Slop Author", true);
  return s;
}
function deliver(newValue) {
  for (const fn of changeListeners) fn({ [AUTHORS_KEY]: { newValue } }, "local");
}

test("the extension boots and hides the slop post", async () => {
  await flush();
  assert.ok(changeListeners.length >= 1, "content.js registered a storage.onChanged listener");
  assert.ok(dom.window.document.getElementById("p-slop").classList.contains("feedhacker-hidden"),
    "the slop post is hidden on the first scan");
});

test("a tally-only author write must NOT re-apply the feed (FH-060)", async () => {
  resets = 0;
  let store = authors.ensure({});
  // Twenty turns of exactly what the loop did: hide -> tally -> write -> back to this tab.
  for (let i = 0; i < 20; i++) {
    store = withTally(store, "/in/slop-author", 1);
    deliver(store);
  }
  await flush();
  assert.strictEqual(resets, 0,
    `tally writes must not reset the verdict ledger (reset called ${resets}x — this is the 1.5s loop)`);
  assert.ok(dom.window.document.getElementById("p-slop").classList.contains("feedhacker-hidden"),
    "…and the post stays hidden throughout");
});

test("…but a real mute from another surface still re-applies at once", async () => {
  resets = 0;
  const muted = authors.mute(withTally(authors.ensure({}), "/in/slop-author", 3), "/in/ok-author", "Ok Author");
  deliver(muted);
  await flush();
  assert.strictEqual(resets, 1, "a changed mute/allow rule must re-apply exactly once");
  assert.ok(dom.window.document.getElementById("p-ok").classList.contains("feedhacker-gone"),
    "the newly muted author's post is hidden without a reload");
});

test("…and an allow rule counts as a rule change too", async () => {
  resets = 0;
  const allowed = authors.allow(authors.mute(authors.ensure({}), "/in/ok-author", "Ok Author"),
    "/in/slop-author", "Slop Author");
  deliver(allowed);
  await flush();
  assert.strictEqual(resets, 1, "adding an allow must re-apply");
  assert.ok(!dom.window.document.getElementById("p-slop").classList.contains("feedhacker-hidden"),
    "the allowlisted author's post comes back");
});
