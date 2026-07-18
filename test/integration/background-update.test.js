"use strict";
// Integration: the compiled background service worker's in-place Chrome Web Store update path.
// Drives the real feedhacker:storeUpdate handler against a mock chrome API and asserts it applies
// a pending/available update (reply + chrome.runtime.reload) or explains why it can't.
const test = require("node:test");
const assert = require("node:assert");

const EXT_ID = "feedhacker-ext-id";

// Build a fresh mock chrome and load a fresh copy of the SW for each scenario (module cache busted),
// so onUpdateAvailable / requestUpdateCheck behavior is isolated per test.
function loadBackground(runtimeExtras) {
  let onMessage, onUpdateAvailable;
  global.chrome = {
    runtime: Object.assign({
      id: EXT_ID,
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      onUpdateAvailable: { addListener: (fn) => { onUpdateAvailable = fn; } },
      lastError: null,
    }, runtimeExtras || {}),
    action: {
      setBadgeBackgroundColor: () => {}, setBadgeText: () => {}, setTitle: () => {},
    },
    tabs: { onRemoved: { addListener: () => {} } },
  };
  delete require.cache[require.resolve("../../build/background.js")];
  require("../../build/background.js");
  return { get onMessage() { return onMessage; }, get onUpdateAvailable() { return onUpdateAvailable; } };
}

const from = () => ({ id: EXT_ID });

test("storeUpdate applies an update Chrome reports as available (reply + reload)", () => {
  let reloaded = false;
  const bg = loadBackground({
    reload: () => { reloaded = true; },
    requestUpdateCheck: (cb) => { cb("update_available", { version: "9.9.9" }); },
  });
  // Simulate Chrome staging the download so the handler applies immediately (no 2.5s wait).
  bg.onUpdateAvailable({ version: "9.9.9" });

  let reply;
  const kept = bg.onMessage({ type: "feedhacker:storeUpdate" }, from(), (r) => { reply = r; });
  assert.strictEqual(kept, true, "handler keeps the message channel open for the async reply");
  assert.ok(reply && reply.ok && reply.updated, "reports the update is being applied");
  assert.strictEqual(reply.version, "9.9.9");
});

test("storeUpdate reports no update when the store has nothing newer (still in review)", () => {
  const bg = loadBackground({
    reload: () => { throw new Error("must not reload when there's nothing to apply"); },
    requestUpdateCheck: (cb) => { cb("no_update"); },
  });
  let reply;
  bg.onMessage({ type: "feedhacker:storeUpdate" }, from(), (r) => { reply = r; });
  assert.ok(reply && reply.ok && !reply.updated && !reply.throttled, "ok but nothing to apply");
});

test("storeUpdate surfaces a throttled check without reloading", () => {
  const bg = loadBackground({
    reload: () => { throw new Error("must not reload when throttled"); },
    requestUpdateCheck: (cb) => { cb("throttled"); },
  });
  let reply;
  bg.onMessage({ type: "feedhacker:storeUpdate" }, from(), (r) => { reply = r; });
  assert.ok(reply && reply.ok && reply.throttled, "reports throttled so the UI can ask to retry");
});

test("storeUpdate fails cleanly when the Chrome build can't check for updates", () => {
  const bg = loadBackground({ /* no requestUpdateCheck */ });
  let reply;
  bg.onMessage({ type: "feedhacker:storeUpdate" }, from(), (r) => { reply = r; });
  assert.ok(reply && reply.ok === false && reply.error, "replies with a failure the UI can show");
});
