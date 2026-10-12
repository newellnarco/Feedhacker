"use strict";
// Integration (FH-077, best_practices §80): the generic /feed/<name>/ gate and the off-feed alarm,
// driven through the compiled content.js the way the browser runs it.
//
// The bug this guards: LinkedIn moved the home feed (to /feed/foryou/ on some accounts), the path
// gate said "not the feed", and the extension idled — hiding nothing and logging nothing, because
// the heartbeat only runs once the gate has said yes. Two halves are proven here: a page full of
// posts on a path FeedHacker does not know is LOGGED (once, naming the path); and any one-level
// /feed/<name>/ is scanned like the home feed.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

// Snapshot every process-wide value we mutate so teardown can restore it (best_practices §27).
const MUTATED = ["self", "window", "document", "location", "MutationObserver", "fetch", "setInterval", "clearInterval", "setTimeout", "chrome", "requestAnimationFrame", "Event"];
const ORIG = {};
for (const k of MUTATED) ORIG[k] = Object.getOwnPropertyDescriptor(globalThis, k);

const EXT_ID = "feedhacker-ext-id";
const FEED = `<!doctype html><html><body><main><div id="feed">
  <div class="post" id="p-ad"><h2>Feed post</h2><a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing</div></div>
  <div class="post" id="p-1"><h2>Feed post</h2><div>Fixed a caching bug this morning, tests pass, shipping later.</div></div>
  <div class="post" id="p-2"><h2>Feed post</h2><div>Our team offsite was in the mountains this year, good talks.</div></div>
</div></main></body></html>`;

// Boot on a path FeedHacker does not know: as if LinkedIn had moved the home feed to /home/.
const dom = new JSDOM(FEED, { url: "https://www.linkedin.com/home/" });
// jsdom defaults to a hidden, unfocused document; the alarm (like the heartbeat) only counts in an
// active tab, so make it look like one.
Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
dom.window.document.hasFocus = () => true;

const errors = [];
let scanCb = null;

global.self = global;
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
global.setInterval = (fn) => { scanCb = fn; return 1; };   // the 8s safety-net scan; we pump it by hand
global.clearInterval = () => {};
global.setTimeout = () => 0;
global.requestAnimationFrame = (cb) => { cb(); return 1; };   // the scroll handler defers to a frame
global.Event = dom.window.Event;   // kickLoader builds a bare `new Event`; Node's own would not dispatch on a jsdom document

global.chrome = {
  runtime: {
    id: EXT_ID, getURL: (p) => p,
    sendMessage: (m) => { if (m && m.type === "feedhacker:error") errors.push(m.entry); },
  },
  storage: {
    sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, { mutePromoted: true })) },
    local: { get: (keys, cb) => cb({}), set: (obj, cb) => { if (cb) cb(); } },
    onChanged: { addListener: () => {} },
  },
};

const MODULES = ["filters", "logger", "selectors", "matcher", "scorer", "authors", "customfilters", "feed"];
for (const m of MODULES) require(`../../build/${m}.js`);
require("../../build/content.js");

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }
function pump(n) { for (let i = 0; i < n; i++) if (scanCb) scanCb(); }
function offFeed() { return errors.filter((e) => e && e.context === "off-feed"); }
function goTo(p) { dom.reconfigure({ url: "https://www.linkedin.com" + p }); }   // SPA route change, no reload
const adHidden = () => dom.window.document.getElementById("p-ad").classList.contains("feedhacker-hidden");

test.after(() => {
  for (const k of MUTATED) {
    if (ORIG[k]) Object.defineProperty(globalThis, k, ORIG[k]);
    else delete globalThis[k];
  }
  for (const k of Object.keys(globalThis)) if (k.startsWith("FeedHacker")) delete globalThis[k];
  for (const id of Object.keys(require.cache)) {
    if (/[\\/]build[\\/](filters|logger|selectors|matcher|scorer|authors|customfilters|feed|content)\.js$/.test(id)) delete require.cache[id];
  }
});

test("posts on an unknown path are not scanned, and are logged once after three settled scans", async () => {
  await flush();
  assert.ok(scanCb, "content.js registered its safety-net scan interval");
  assert.strictEqual(adHidden(), false, "off the feed, nothing is hidden");
  pump(1);   // boot made one scan; this is the second
  assert.strictEqual(offFeed().length, 0, "two scans are not yet an alarm");
  pump(1);
  assert.strictEqual(offFeed().length, 1, "the third settled scan logs it");
  assert.match(offFeed()[0].msg, /\/home\/.*home feed may have moved/, "the entry names the path");
  pump(6);
  assert.strictEqual(offFeed().length, 1, "logged once per path, not once per scan");
});

test("a page we know carries posts (a group) never alarms", () => {
  goTo("/groups/123/");
  pump(6);
  assert.strictEqual(offFeed().length, 1, "no new off-feed entry on /groups/");
});

// The generic gate admits any one-level /feed/<name>/, so a /feed/ page that is NOT a feed must be
// left alone: no kicking LinkedIn's loader there. The no-posts case runs FIRST: a kick that lands
// leaves pump() busy (its step timer is stubbed), which would make a later "no kick" vacuous.
test("the auto-loader never kicks LinkedIn's loader on a /feed/<name>/ page with no posts, and does on a feed", () => {
  const doc = dom.window.document;
  const tok = "t0k";
  doc.documentElement.setAttribute("data-feedhacker-hook", tok);
  let kicks = 0;
  doc.addEventListener("feedhacker:kick:" + tok, () => { kicks++; });
  const feed = doc.getElementById("feed");
  const posts = Array.from(feed.children);
  for (const p of posts) feed.removeChild(p);

  goTo("/feed/not-a-feed/");
  dom.window.dispatchEvent(new dom.window.Event("scroll"));
  assert.strictEqual(kicks, 0, "no posts on the page: the loader is left alone");

  for (const p of posts) feed.appendChild(p);
  goTo("/feed/following/");
  dom.window.dispatchEvent(new dom.window.Event("scroll"));
  assert.ok(kicks > 0, "control: on a feed with posts the same scroll does kick the loader");
});

test("any one-level /feed/<name>/ is the home feed: /feed/following/ is scanned and filtered", () => {
  goTo("/feed/following/");
  pump(1);
  assert.strictEqual(adHidden(), true, "the Promoted post is hidden on /feed/following/");
  assert.strictEqual(offFeed().length, 1, "and the feed raises no off-feed alarm");
});
