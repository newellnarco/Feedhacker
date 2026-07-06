"use strict";
// Integration: the compiled background service worker wired to a mock chrome API.
// Drives the real onMessage handler end-to-end and asserts the toolbar badge state
// (count vs. error precedence vs. clear), exactly as content.js -> background.js do.
const test = require("node:test");
const assert = require("node:assert");

const EXT_ID = "feedhacker-ext-id";
const badge = {};        // tabId -> badge text
const title = {};        // tabId -> title
let bgColor = null;
let onMessage, onRemoved;

global.chrome = {
  runtime: { id: EXT_ID, onMessage: { addListener: (fn) => { onMessage = fn; } } },
  action: {
    setBadgeBackgroundColor: (o) => { bgColor = o.color; },
    setBadgeText: (o) => { badge[o.tabId != null ? o.tabId : "*"] = o.text; },
    setTitle: (o) => { title[o.tabId != null ? o.tabId : "*"] = o.title; },
  },
  tabs: { onRemoved: { addListener: (fn) => { onRemoved = fn; } } },
};

require("../../build/background.js"); // registers the listeners on load

const from = (tabId) => ({ id: EXT_ID, tab: tabId == null ? undefined : { id: tabId } });

test("count message paints the hidden count on the sending tab", () => {
  onMessage({ type: "feedhacker:count", count: 3 }, from(7));
  assert.strictEqual(badge[7], "3");
  assert.match(title[7], /3 hidden/);
  onMessage({ type: "feedhacker:count", count: 0 }, from(7));
  assert.strictEqual(badge[7], "", "zero clears the badge text");
});

test("messages from a foreign sender are ignored", () => {
  badge[9] = "sentinel";
  onMessage({ type: "feedhacker:count", count: 5 }, { id: "someone-else", tab: { id: 9 } });
  assert.strictEqual(badge[9], "sentinel", "foreign sender must not paint");
});

test("an error paints '!' and takes precedence over later counts", () => {
  onMessage({ type: "feedhacker:error", entry: { iso: "2026-07-05T12:00:00.000Z" } }, from(11));
  assert.strictEqual(badge[11], "!");
  assert.match(title[11], /error/i);
  onMessage({ type: "feedhacker:count", count: 4 }, from(11));
  assert.strictEqual(badge[11], "!", "count must not overwrite an unacknowledged error");
});

test("clearError (from the popup, no tab) clears flagged tabs and lets counts paint again", () => {
  onMessage({ type: "feedhacker:clearError" }, from(null));
  assert.strictEqual(badge[11], "", "error badge cleared");
  onMessage({ type: "feedhacker:count", count: 2 }, from(11));
  assert.strictEqual(badge[11], "2", "counts paint once the error is acknowledged");
});

test("closing a tab forgets its error state", () => {
  onMessage({ type: "feedhacker:error", entry: {} }, from(21));
  assert.strictEqual(badge[21], "!");
  onRemoved(21);
  onMessage({ type: "feedhacker:count", count: 6 }, from(21));
  assert.strictEqual(badge[21], "6", "after the tab is removed, its error no longer blocks counts");
});
