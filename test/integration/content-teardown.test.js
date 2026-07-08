"use strict";
// Integration: when FeedHacker's extension context is invalidated (the unpacked
// extension is reloaded/updated/disabled while a LinkedIn tab stays open), the
// orphaned content script must FAIL SAFE — stop reacting to the page and restore
// what it hid — instead of churning and driving extra feed loads forever. We boot
// content.js exactly like content-boot.test.js, let it hide a Promoted post, then
// drop chrome.runtime.id and nudge the DOM so the MutationObserver notices the dead
// context. The hidden post must be revealed and the stub removed.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

const EXT_ID = "feedhacker-ext-id";
const FEED = `<!doctype html><html><body><main><div id="feed">
  <div class="post" id="p-ad"><h2>Feed post</h2><a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing</div></div>
  <div class="post" id="p-ok"><h2>Feed post</h2><div>Fixed a caching bug this morning, tests pass, shipping later.</div></div>
</div></main></body></html>`;

const dom = new JSDOM(FEED, { url: "https://www.linkedin.com/feed/" });
const localStore = {};

global.self = global;
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.requestAnimationFrame = () => 0;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
global.setInterval = () => 0;        // silence the 8s safety-net scan
global.clearInterval = () => {};
global.setTimeout = () => 0;         // boot + teardown are synchronous; debounced timers are inert here

// A mutable runtime so the test can simulate context invalidation by clearing `id`.
const runtime = { id: EXT_ID, getURL: (p) => p, sendMessage: () => {} };
global.chrome = {
  runtime,
  storage: {
    sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, { mutePromoted: true })) },
    local: { get: (keys, cb) => cb({}), set: (obj, cb) => { Object.assign(localStore, obj); if (cb) cb(); } },
    onChanged: { addListener: () => {} },
  },
};

for (const m of ["filters", "logger", "selectors", "matcher", "scorer", "authors", "customfilters", "feed"]) {
  require(`../../build/${m}.js`);
}
require("../../build/content.js");

function flush() { return new Promise((r) => setImmediate(r)); }

test("content.js fails safe when its extension context is invalidated", async () => {
  for (let i = 0; i < 5; i++) await flush();
  const ad = dom.window.document.getElementById("p-ad");
  assert.ok(ad.classList.contains("feedhacker-hidden"), "precondition: promoted post is hidden while alive");
  assert.ok(ad.querySelector(".feedhacker-stub"), "precondition: a stub was inserted");

  // Simulate the extension being reloaded/disabled: the content script is orphaned
  // and chrome.runtime.id goes away. A DOM change then wakes the MutationObserver.
  runtime.id = undefined;
  const extra = dom.window.document.createElement("div");
  extra.className = "post";
  dom.window.document.getElementById("feed").appendChild(extra);
  for (let i = 0; i < 5; i++) await flush();

  assert.ok(!ad.classList.contains("feedhacker-hidden"), "orphaned FeedHacker revealed the hidden post");
  assert.ok(!ad.querySelector(".feedhacker-stub"), "orphaned FeedHacker removed its stub");
});
