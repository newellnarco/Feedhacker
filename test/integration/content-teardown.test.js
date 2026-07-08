"use strict";
// Integration: when the extension context is invalidated (Chrome auto-updated or the
// user reloaded the extension while a LinkedIn tab stayed open), the orphaned content
// script must STOP — clear its interval, disconnect its observer, drop its injected UI,
// and reveal anything it hid — instead of churning and logging "context invalidated"
// noise for the life of the tab. This guards that teardown path.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

const EXT_ID = "feedhacker-ext-id";
const FEED = `<!doctype html><html><body><main><div id="feed">
  <div class="post" id="p-ad"><h2>Feed post</h2><a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing</div></div>
  <div class="post" id="p-ok"><h2>Feed post</h2><div>Fixed a caching bug this morning, tests pass, shipping later.</div></div>
</div></main></body></html>`;

const dom = new JSDOM(FEED, { url: "https://www.linkedin.com/feed/" });

global.self = global;
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });

// Capture the 8s safety-net interval so the test can fire it on demand, and record
// whether teardown clears it.
let intervalCb = null;
const INTERVAL_ID = 424242;
let clearedId = "not-cleared";
global.setInterval = (cb) => { intervalCb = cb; return INTERVAL_ID; };
global.clearInterval = (id) => { clearedId = id; };
global.setTimeout = (cb) => 0;   // debounced timers inert; we drive scans directly

// A mutable runtime.id so we can simulate the context going invalid mid-session.
const runtime = { id: EXT_ID, getURL: (p) => p, sendMessage: () => {} };
global.chrome = {
  runtime,
  storage: {
    sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, { mutePromoted: true })) },
    local: { get: (keys, cb) => cb({}), set: (obj, cb) => { if (cb) cb(); } },
    onChanged: { addListener: () => {} },
  },
};

for (const m of ["filters", "logger", "selectors", "matcher", "scorer", "authors", "customfilters", "feed"]) {
  require(`../../build/${m}.js`);
}
require("../../build/content.js");

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }

test("boot hides the promoted post and grafts the Load-more bar", async () => {
  await flush();
  const ad = dom.window.document.getElementById("p-ad");
  assert.ok(ad.classList.contains("feedhacker-hidden"), "promoted post hidden before invalidation");
  assert.ok(dom.window.document.getElementById("feedhacker-loadmore"), "Load-more bar inserted");
  assert.ok(typeof intervalCb === "function", "the 8s safety-net interval was registered");
});

test("an invalidated context tears the content script down cleanly", async () => {
  await flush();
  // Simulate Chrome swapping in a new extension context: runtime.id goes away.
  runtime.id = undefined;

  // The next periodic scan notices the dead context and tears down.
  intervalCb();

  const ad = dom.window.document.getElementById("p-ad");
  assert.strictEqual(clearedId, INTERVAL_ID, "the safety-net interval was cleared");
  assert.ok(!ad.classList.contains("feedhacker-hidden"), "the hidden post was revealed on teardown");
  assert.strictEqual(dom.window.document.getElementById("feedhacker-loadmore"), null, "the injected Load-more bar was removed");
});

test("a torn-down script does no further work even if scans are invoked", async () => {
  // Context comes back valid, but we stay dead — a fresh context means a fresh
  // content script, not a resurrected orphan.
  runtime.id = EXT_ID;
  clearedId = "not-cleared-again";
  intervalCb();
  const ad = dom.window.document.getElementById("p-ad");
  assert.ok(!ad.classList.contains("feedhacker-hidden"), "stays revealed — no re-scan after teardown");
  assert.strictEqual(clearedId, "not-cleared-again", "no further teardown side effects");
});
