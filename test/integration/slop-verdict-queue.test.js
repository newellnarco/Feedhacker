"use strict";
// Integration: confirming a whole grouped run must not lose training examples.
//
// A verdict is a read-modify-write over two storage keys (the decision log and the training
// buffer). The group splat confirms every slop post in a run in ONE tick, so without
// serialization all of those reads see the same pre-state and the last write wins — the
// learner silently keeps one example out of N (best_practices §7, and §37's group row).
// This drives the compiled glue with an ASYNC storage mock, which is what makes the race real.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
const POSTS = [0, 1, 2, 3]
  .map((i) => `<div class="post" id="p${i}"><h2>Feed post</h2><a href="/in/a${i}">Auth ${i}</a><div>${SLOP}</div></div>`)
  .join("");
const FEED = `<!doctype html><html><body><main><div id="feed">${POSTS}</div></main></body></html>`;

const TRAIN_KEY = "feedhacker:sloptrain";
const MODULES = ["filters", "logger", "selectors", "matcher", "scorer", "sloplog", "authors", "customfilters", "feed", "content"];

// §27: this file replaces process globals and the module registry, so it restores both.
function boot() {
  const saved = {};
  for (const k of ["self", "window", "document", "location", "MutationObserver", "fetch", "chrome",
                   "setInterval", "clearInterval", "setTimeout", "clearTimeout"]) {
    saved[k] = global[k];
  }
  const cached = MODULES.map((m) => require.resolve(path.join(__dirname, "..", "..", "build", `${m}.js`)));
  for (const id of cached) delete require.cache[id];

  const dom = new JSDOM(FEED, { url: "https://www.linkedin.com/feed/" });
  const local = {};
  global.self = global;
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.MutationObserver = dom.window.MutationObserver;
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
  global.setInterval = () => 0;      // no 8s heartbeat in the test
  global.clearInterval = () => {};
  // Inert timers: the glue's debounced flushes are irrelevant here, and letting them fire
  // after the test tore the chrome mock down would raise a late "chrome is not defined".
  // The verdict path under test is driven by storage callbacks (setImmediate), not timers.
  global.setTimeout = () => 0;
  global.clearTimeout = () => {};
  global.chrome = {
    runtime: { id: "test-ext", getURL: (p) => p, sendMessage: () => {} },
    storage: {
      sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, { groupHiddenRuns: true })) },
      local: {
        // ASYNCHRONOUS on purpose: a synchronous get hides the interleaving entirely.
        get: (keys, cb) => setImmediate(() => {
          const out = {};
          for (const k of [].concat(keys)) if (k in local) out[k] = local[k];
          cb(out);
        }),
        set: (obj, cb) => setImmediate(() => { Object.assign(local, obj); if (cb) cb(); }),
        remove: (k, cb) => setImmediate(() => { delete local[k]; if (cb) cb(); }),
      },
      onChanged: { addListener: () => {} },
    },
  };

  for (const id of cached) require(id);
  const restore = () => {
    for (const id of cached) delete require.cache[id];
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete global[k];
      else global[k] = saved[k];
    }
  };
  return { dom, local, restore };
}
const flush = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test("confirming a grouped run records one training example per post, not just the last", async () => {
  const { dom, local, restore } = boot();
  try {
    await flush();
    const doc = dom.window.document;
    const splat = doc.querySelector('.feedhacker-group [data-fh-act="confirm-group"]');
    assert.ok(splat, "the folded run offers the AI-slop splat (FH-044)");

    splat.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await flush();

    const train = local[TRAIN_KEY] || [];
    assert.strictEqual(train.length, 4, "every confirmed post left a training example");
    assert.deepStrictEqual(train.map((t) => t.label), [1, 1, 1, 1], "…all labelled 'slop'");
    assert.strictEqual(new Set(train.map((t) => t.id)).size, 4, "…one per decision, no collisions");
  } finally {
    restore();
  }
});
