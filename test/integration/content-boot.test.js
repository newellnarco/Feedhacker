"use strict";
// Integration: boot the compiled content-script glue (content.js) exactly as the
// browser would — all sibling modules on `self`, a mock chrome storage/runtime, a
// mock banlist fetch, and a jsdom LinkedIn feed. Asserts the whole wired system
// (settings -> scan -> DOM mutation -> badge message) works, not just one module.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

const EXT_ID = "feedhacker-ext-id";
const FEED = `<!doctype html><html><body><main><div id="feed">
  <div class="post" id="p-ad"><h2>Feed post</h2><a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing</div></div>
  <div class="post" id="p-ok"><h2>Feed post</h2><div>Fixed a caching bug this morning, tests pass, shipping later.</div></div>
</div></main></body></html>`;

const dom = new JSDOM(FEED, { url: "https://www.linkedin.com/feed/" });
const sentMessages = [];
const localStore = {};

// Wire the browser globals content.js expects.
global.self = global;
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
global.setInterval = () => 0;        // silence the 8s heartbeat so the test doesn't hang
global.clearInterval = () => {};
global.setTimeout = () => 0;         // boot + initial scan are synchronous; debounced timers are inert here

global.chrome = {
  runtime: { id: EXT_ID, getURL: (p) => p, sendMessage: (m) => { sentMessages.push(m); } },
  storage: {
    // Home feed default has only AI slop on; turn on Promoted so we exercise a
    // deterministic (non-ML) filter that behaves identically to production.
    sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, { mutePromoted: true })) },
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => { Object.assign(localStore, obj); if (cb) cb(); },
    },
    onChanged: { addListener: () => {} },
  },
};

// Load siblings onto `self`, then boot the glue (its IIFE runs on require).
for (const m of ["filters", "logger", "selectors", "matcher", "scorer", "authors", "customfilters", "feed"]) {
  require(`../../build/${m}.js`);
}
require("../../build/content.js");

async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }

test("content.js boots, hides a Promoted post, and leaves a normal post visible", async () => {
  await flush();
  const ad = dom.window.document.getElementById("p-ad");
  const ok = dom.window.document.getElementById("p-ok");
  assert.ok(ad.classList.contains("feedhacker-hidden"), "promoted post hidden");
  assert.ok(!ok.classList.contains("feedhacker-hidden"), "normal post stays visible");
  assert.ok(ad.querySelector(".feedhacker-stub"), "a collapse stub was inserted");
});

test("content.js reports the hidden count to the background worker", async () => {
  await flush();
  const counts = sentMessages.filter((m) => m && m.type === "feedhacker:count");
  assert.ok(counts.length > 0, "at least one count message sent");
  assert.strictEqual(counts[counts.length - 1].count, 1, "one post hidden on this feed");
});
