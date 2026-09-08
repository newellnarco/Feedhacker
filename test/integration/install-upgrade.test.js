"use strict";
// Integration: what the background service worker does on install vs upgrade.
//
// The maintainer's rule: "an upgrade should keep all the existing settings as user set up;
// a NEW install gets the shipped defaults." Both halves are load-bearing and neither was
// guarded before. The danger is a well-meaning onInstalled handler that "initialises"
// settings and, on an update, writes over choices the user made months ago.
const test = require("node:test");
const assert = require("node:assert");

const EXT_ID = "feedhacker-ext-id";
const created = [];        // tabs opened
const syncWrites = [];     // every chrome.storage.sync.set the worker performs
const localWrites = [];
let onInstalled;

global.chrome = {
  runtime: {
    id: EXT_ID,
    getURL: (p) => "chrome-extension://" + EXT_ID + "/" + p,
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: (fn) => { onInstalled = fn; } },
  },
  action: { setBadgeBackgroundColor: () => {}, setBadgeText: () => {}, setTitle: () => {} },
  tabs: { onRemoved: { addListener: () => {} }, create: (o) => { created.push(o.url); } },
  storage: {
    sync: { set: (p) => { syncWrites.push(p); }, get: (d, cb) => cb && cb(d) },
    local: { set: (p) => { localWrites.push(p); }, get: (d, cb) => cb && cb({}) },
  },
};

require("../../build/background.js");

test("the worker registers an onInstalled listener", () => {
  assert.strictEqual(typeof onInstalled, "function");
});

test("a fresh install opens the welcome page and writes NO settings", () => {
  created.length = 0; syncWrites.length = 0; localWrites.length = 0;
  onInstalled({ reason: "install" });
  assert.strictEqual(created.length, 1, "welcome page should open once");
  assert.match(created[0], /welcome\.html$/);
  // Defaults are a read-time fallback (storage.sync.get(DEFAULTS)), never seeded on disk.
  assert.deepStrictEqual(syncWrites, [], "install must not seed settings into storage");
  assert.deepStrictEqual(localWrites, []);
});

test("an UPGRADE writes nothing at all — the user's settings survive untouched", () => {
  created.length = 0; syncWrites.length = 0; localWrites.length = 0;
  onInstalled({ reason: "update", previousVersion: "0.4.8" });
  assert.deepStrictEqual(syncWrites, [], "an upgrade must never write settings");
  assert.deepStrictEqual(localWrites, [], "an upgrade must never write stored state");
  assert.strictEqual(created.length, 0, "an upgrade must not hijack a tab");
});

test("a chrome_update / shared_module_update is likewise inert", () => {
  created.length = 0; syncWrites.length = 0;
  onInstalled({ reason: "chrome_update" });
  assert.deepStrictEqual(syncWrites, []);
  assert.strictEqual(created.length, 0);
});
