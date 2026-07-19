"use strict";
// Integration: drive the compiled content.js heartbeat the way the browser would, and prove
// the "No LinkedIn post markers found" alarm no longer false-fires on LinkedIn paging.
//
// Regression for: the heartbeat logged a scary "selectors may be out of date" error whenever the
// feed was momentarily empty while LinkedIn paged in more content. It now fires ONLY on a genuine
// break — the feed has rendered posts (role=article / activity-URN) yet none match our marker.
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

const EXT_ID = "feedhacker-ext-id";
// Boot on an EMPTY feed (paging / between page loads): no post markers AND no post content.
const dom = new JSDOM(
  `<!doctype html><html><body><main><div id="feed"></div></main></body></html>`,
  { url: "https://www.linkedin.com/feed/" }
);
// Make the tab look active (jsdom defaults document.hidden to true and has no real focus), so the
// heartbeat is allowed to count — otherwise tabActive() short-circuits and nothing is exercised.
Object.defineProperty(dom.window.document, "hidden", { value: false, configurable: true });
dom.window.document.hasFocus = () => true;

const localStore = {};
let scanCb = null;

global.self = global;
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.MutationObserver = dom.window.MutationObserver;
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
// Capture the slow safety-net scan callback so we can pump heartbeat cycles deterministically.
global.setInterval = (fn) => { scanCb = fn; return 1; };
global.clearInterval = () => {};
global.setTimeout = () => 0;   // debounced observer/scan timers stay inert; we drive scans by hand

global.chrome = {
  runtime: { id: EXT_ID, getURL: (p) => p, sendMessage: () => {} },
  storage: {
    sync: { get: (defaults, cb) => cb(Object.assign({}, defaults)) },
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => { Object.assign(localStore, obj); if (cb) cb(); },
    },
    onChanged: { addListener: () => {} },
  },
};

for (const m of ["filters", "logger", "selectors", "matcher", "scorer", "authors", "customfilters", "feed"]) {
  require(`../../build/${m}.js`);
}
require("../../build/content.js");

const ERR_KEY = require("../../build/logger.js").STORAGE_KEY;
async function flush() { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }
function heartbeatErrors() {
  return (localStore[ERR_KEY] || []).filter((e) => e && e.context === "heartbeat");
}
function pump(n) { for (let i = 0; i < n; i++) { if (scanCb) scanCb(); } }

test("an empty/paging feed never trips the heartbeat, however many scans run", async () => {
  await flush();
  assert.ok(scanCb, "content.js registered its safety-net scan interval");
  pump(6);   // well past the 3-run threshold
  assert.strictEqual(heartbeatErrors().length, 0, "no heartbeat alarm while the feed is empty (paging)");
});

test("a genuine selector break (posts present, none match our marker) still alarms", async () => {
  // Feed now has rendered posts (role=article / activity-URN) but NONE carry our "Feed post"
  // marker heading — the real "selectors out of date" condition.
  dom.window.document.getElementById("feed").innerHTML =
    '<div role="article"><div>a real post the marker no longer matches</div></div>' +
    '<div data-urn="urn:li:activity:2"><div>another post</div></div>' +
    '<div data-urn="urn:li:activity:3"><div>and another</div></div>';
  pump(3);   // three consecutive break scans reach the alarm threshold
  assert.strictEqual(heartbeatErrors().length, 1, "the genuine break is surfaced exactly once");
  assert.match(heartbeatErrors()[0].msg, /post markers/);
});
