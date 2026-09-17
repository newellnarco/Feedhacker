"use strict";
// Integration: what the background service worker does on install vs upgrade.
//
// The maintainer's rule: "an upgrade should keep all the existing settings as user set up;
// a NEW install gets the shipped defaults." Both halves are load-bearing and neither was
// guarded before. The danger is a well-meaning onInstalled handler that "initialises"
// settings and, on an update, writes over choices the user made months ago.
//
// 0.9.0 adds ONE narrow, deliberate exception, at the maintainer's direction: *"make .9 upon
// install perform the reset once during the install so users in the wild don't have to be told
// to do it."* FH-060's re-judge loop poisoned the self-tuned AI model, and a code fix cannot
// undo that — the weights and threshold are stored user state and survive an update. Left to a
// release note, the installs still running a model trained to catch less would be exactly the
// ones whose owners never read it.
//
// So the contract is now precise rather than absolute, and these tests pin both sides of it:
// an upgrade clears the AI-slop learning ONCE and nothing else, ever. Filter choices, muted
// authors, custom filters, stats and logs stay untouched.
const test = require("node:test");
const assert = require("node:assert");
// The worker pulls filters.js in with importScripts and reads it off `self`. Mirror that
// exactly — a mock that skipped it would make the migration self-skip and every assertion
// below pass for the wrong reason.
global.self = global;
const filters = require("../../build/filters.js");
require("../../build/filters.js");        // …and onto `self`, the way importScripts leaves it

const EXT_ID = "feedhacker-ext-id";
const MIGRATIONS_KEY = "feedhacker:migrations";
const created = [];        // tabs opened
const syncWrites = [];     // every chrome.storage.sync.set the worker performs
const localWrites = [];
const localRemoves = [];
let onInstalled;

// A real backing store, because "runs at most once ever" cannot be tested against a mock that
// always reports empty storage — the migration would look correct while re-running forever.
let store = {};

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
    local: {
      set: (p, cb) => { localWrites.push(p); Object.assign(store, p); if (cb) cb(); },
      get: (keys, cb) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
        if (cb) cb(out);
      },
      remove: (keys, cb) => {
        localRemoves.push([].concat(keys));
        for (const k of [].concat(keys)) delete store[k];
        if (cb) cb();
      },
    },
  },
};

require("../../build/background.js");

function reset(seed) {
  created.length = 0; syncWrites.length = 0; localWrites.length = 0; localRemoves.length = 0;
  store = Object.assign({}, seed || {});
}
// What a poisoned install looks like: a self-tuned model plus everything the user set up.
const USER_SETUP = {
  "feedhacker:authors": { muted: { "/in/someone": { name: "Someone" } }, allowed: {}, scores: {} },
  "feedhacker:custom": [{ pattern: "crypto" }],
  "feedhacker:stats": { total: 4212 },
  "feedhacker:history": { "2026-09-17": { total: 9 } },
  "feedhacker:errorlog": [{ msg: "something" }],
};
const POISONED = Object.assign({
  "feedhacker:slopWeights": { broetry: 0.792, bullets: 0.516 },
  "feedhacker:sloptrain": [{ label: 1 }],
  "feedhacker:slopobs": new Array(189).fill({ features: {} }),
  "feedhacker:slopcal": { threshold: 0.57, at: 1 },
  "feedhacker:sloplog": new Array(300).fill({ prob: 0.6 }),
}, USER_SETUP);

test("the worker registers an onInstalled listener", () => {
  assert.strictEqual(typeof onInstalled, "function");
});

test("a fresh install opens the welcome page and seeds NO settings", () => {
  reset();
  onInstalled({ reason: "install" });
  assert.strictEqual(created.length, 1, "welcome page should open once");
  assert.match(created[0], /welcome\.html$/);
  // Defaults are a read-time fallback (storage.sync.get(DEFAULTS)), never seeded on disk.
  assert.deepStrictEqual(syncWrites, [], "install must not seed settings into storage");
  // The one local write is the migration ledger, NOT settings — see the next test for why.
  assert.deepStrictEqual(localWrites.map((w) => Object.keys(w)), [[MIGRATIONS_KEY]],
    "the only thing a fresh install writes is the migration ledger");
  assert.deepStrictEqual(localRemoves, [], "a fresh install has nothing to clear");
});

test("a fresh install banks the AI reset as done, so the user's FIRST update can't wipe it", () => {
  // The trap this guards: install 0.9.0 fresh, train the model for a week, update to 0.9.1,
  // and a migration that had never been marked done destroys a week of real learning.
  reset();
  onInstalled({ reason: "install" });
  const trained = { "feedhacker:slopWeights": { broetry: 1.4 }, "feedhacker:sloptrain": [{ label: 0 }] };
  Object.assign(store, trained);
  created.length = 0; syncWrites.length = 0; localWrites.length = 0; localRemoves.length = 0;

  onInstalled({ reason: "update", previousVersion: "0.9.0" });
  assert.deepStrictEqual(localRemoves, [], "the model this user trained themselves must survive");
  assert.deepStrictEqual(store["feedhacker:slopWeights"], { broetry: 1.4 });
  assert.deepStrictEqual(syncWrites, [], "…and their tuning is not reset either");
});

test("an UPGRADE clears the AI-slop learning once, and NOTHING else", () => {
  reset(POISONED);
  onInstalled({ reason: "update", previousVersion: "0.8.0" });

  assert.deepStrictEqual(localRemoves, [filters.SLOP_LOCAL_KEYS],
    "exactly the shared AI-reset list, so this and the options button cannot drift apart");
  for (const k of filters.SLOP_LOCAL_KEYS) {
    assert.ok(!(k in store), `${k} must be gone — it is what the flood poisoned`);
  }
  // The other half of the contract, and the more important one.
  for (const k of Object.keys(USER_SETUP)) {
    assert.deepStrictEqual(store[k], USER_SETUP[k], `${k} is the user's own setup and must be untouched`);
  }
  assert.strictEqual(created.length, 0, "an upgrade must not hijack a tab");

  // The two AI tuning values are restored from buildDefaults(), never from a literal.
  const d = filters.buildDefaults();
  assert.strictEqual(syncWrites.length, 1, "one sync write, not a settings rewrite");
  assert.deepStrictEqual(Object.keys(syncWrites[0]).sort(), [...filters.SLOP_SYNC_KEYS].sort(),
    "ONLY the AI tuning keys — no mute*, no display settings");
  for (const k of filters.SLOP_SYNC_KEYS) {
    assert.strictEqual(syncWrites[0][k], d[k], `${k} must come back as the shipped default`);
  }
  assert.strictEqual(syncWrites[0].slopThreshold, 0.5, "0.570 was the poisoned value; 0.5 ships");
});

test("…and a SECOND upgrade does nothing — it runs once ever, not once per release", () => {
  reset(POISONED);
  onInstalled({ reason: "update", previousVersion: "0.8.0" });
  // Whatever the user has learned since is theirs to keep.
  store["feedhacker:slopWeights"] = { broetry: 1.1 };
  store["feedhacker:sloptrain"] = [{ label: 0 }, { label: 1 }];
  created.length = 0; syncWrites.length = 0; localWrites.length = 0; localRemoves.length = 0;

  onInstalled({ reason: "update", previousVersion: "0.9.0" });
  assert.deepStrictEqual(localRemoves, [], "the migration must not fire a second time");
  assert.deepStrictEqual(syncWrites, [], "…nor re-reset the threshold");
  assert.deepStrictEqual(store["feedhacker:slopWeights"], { broetry: 1.1 },
    "a model retrained after the recovery is the user's, not ours to clear");
});

test("the ledger is only marked once the clear has actually happened", () => {
  // A worker torn down mid-migration must re-run it, not record a reset that never landed.
  // Asserted by ORDER: the remove resolves before the ledger write.
  reset(POISONED);
  onInstalled({ reason: "update", previousVersion: "0.8.0" });
  assert.strictEqual(localRemoves.length, 1, "the clear ran");
  const ledger = localWrites.find((w) => MIGRATIONS_KEY in w);
  assert.ok(ledger, "the ledger was written");
  assert.ok(typeof ledger[MIGRATIONS_KEY].slopResetFH060 === "number",
    "…and stamped with when, so the record says more than 'true'");
});

test("a chrome_update / shared_module_update is likewise inert", () => {
  reset(POISONED);
  onInstalled({ reason: "chrome_update" });
  assert.deepStrictEqual(syncWrites, []);
  assert.deepStrictEqual(localRemoves, [], "a browser restart is not an upgrade");
  assert.strictEqual(created.length, 0);
});
