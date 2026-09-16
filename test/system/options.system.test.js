"use strict";
// System (E2E): the options page's destructive controls, driven in real headless Chromium
// against real chrome.storage.
//
// These two buttons delete user data, so "it typechecks" is not enough — the failure modes are
// only visible in a browser: a byId() on a missing element throws at load and silently breaks
// the WHOLE options page, and a reset that misses a key looks like it worked.
const test = require("node:test");
const assert = require("node:assert");
const { resolveChrome, extensionBuilt, launchOptions } = require("./helper");

// The options page is a stack of collapsed <details> panels; a real user clicks one open.
// Expand them all so the controls under test are actually interactable.
const openPanels = (page) =>
  page.evaluate(() => document.querySelectorAll("details.panel").forEach((d) => (d.open = true)));

const browser = resolveChrome();
const skip = process.env.CI
  ? false
  : !browser.ok
  ? "no Chromium available (run `npx playwright install chromium`)"
  : !extensionBuilt()
  ? "extension not built (run `npm run build`)"
  : false;

const AUTHORS_KEY = "feedhacker:authors";
const WEIGHTS_KEY = "feedhacker:slopWeights";
const CUSTOM_KEY = "feedhacker:custom";

// A thoroughly "used" profile: muted authors, an allowlisted one, a learned model, custom
// filters, and settings far from the defaults.
const DIRTY_LOCAL = {
  [AUTHORS_KEY]: {
    muted: { "jane-doe": { name: "Jane Doe", at: 1 }, "acme-co": { name: "Acme", at: 2 } },
    allowed: { "pat-smith": { name: "Pat Smith", at: 3 } },
    scores: { "jane-doe": { hidden: 9, shown: 1, name: "Jane Doe" } },
  },
  [WEIGHTS_KEY]: { bias: -1, emoji: 5 },
  [CUSTOM_KEY]: { phrases: ["synergy"] },
};
// soloPromoted is a LEGACY key from a pre-0.8.0 install — deliberately left in the dirty
// fixture so the reset paths are exercised against real leftover state, not a tidy one.
const DIRTY_SYNC = { muteSloppy: false, mutePromoted: true, soloPromoted: true, nameNames: true };

// The learned AI state FH-054 used to leave behind. slopThreshold is the one that matters most:
// auto-calibration writes it to sync, and FH-050 found it self-tuned down to 0.428–0.471, so a
// "reset" that leaves it there hands the rebuilt model the same pulled-down cutoff.
const TRAIN_KEY = "feedhacker:sloptrain";
const OBS_KEY = "feedhacker:slopobs";
const CAL_KEY = "feedhacker:slopcal";
const SLOPLOG_KEY = "feedhacker:sloplog";
const DIRTY_AI_LOCAL = Object.assign({}, DIRTY_LOCAL, {
  [TRAIN_KEY]: [{ label: "slop", f: { emoji: 1 } }, { label: "ok", f: { emoji: 0 } }],
  [OBS_KEY]: [{ emoji: 1 }, { emoji: 0 }],
  [CAL_KEY]: { at: 1, threshold: 0.43, flaggedFrac: 0.6, n: 40 },
  [SLOPLOG_KEY]: [{ at: 1, prob: 0.9 }],
});
const DIRTY_AI_SYNC = Object.assign({}, DIRTY_SYNC, { slopThreshold: 0.43, slopTargetFrac: 0.6 });

test("the options page loads without a script error", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchOptions({});
  try {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.waitForSelector("#unmute-all", { state: "attached" });
    await openPanels(page);
    assert.deepStrictEqual(errors, [], "options.js must not throw at load");
    // Every control this change adds must actually be in the page.
    for (const id of ["#unmute-all", "#factory-reset", "#factory-reset-authors"]) {
      assert.strictEqual(await page.locator(id).count(), 1, `${id} is present`);
    }
  } finally { await close(); }
});

test("Unmute all clears the mutes and leaves the allowlist + scores intact", { skip, timeout: 60000 }, async () => {
  const { page, sw, close } = await launchOptions({ local: DIRTY_LOCAL });
  try {
    await openPanels(page);
    page.on("dialog", (d) => d.accept());
    await page.click("#unmute-all");
    await page.waitForFunction(() => /Unmuted/.test(document.getElementById("unmute-all").textContent));
    const store = await sw.evaluate((k) => new Promise((r) =>
      chrome.storage.local.get([k], (o) => r(o[k]))), AUTHORS_KEY);
    assert.deepStrictEqual(Object.keys(store.muted), [], "every mute is gone");
    assert.deepStrictEqual(Object.keys(store.allowed), ["pat-smith"], "allowlist survives");
    assert.strictEqual(store.scores["jane-doe"].hidden, 9, "learned per-author history survives");
  } finally { await close(); }
});

test("Factory reset returns a dirty profile to a clean install", { skip, timeout: 60000 }, async () => {
  const { page, sw, close } = await launchOptions({ local: DIRTY_LOCAL, sync: DIRTY_SYNC });
  try {
    await openPanels(page);
    page.on("dialog", (d) => d.accept());
    await page.click("#factory-reset");
    await page.waitForFunction(() => /Reset complete/.test(document.getElementById("factory-reset").textContent));

    // Nothing learned or remembered is left behind.
    const local = await sw.evaluate(() => new Promise((r) => chrome.storage.local.get(null, r)));
    const leftover = Object.keys(local).filter((k) => k.startsWith("feedhacker:"));
    assert.deepStrictEqual(leftover, [], "no stored FeedHacker state survives a factory reset");

    // …and settings are exactly a clean install: AI slop on, nothing else.
    const sync = await sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    assert.strictEqual(sync.muteSloppy, true, "the default AI algorithm is back on");
    assert.strictEqual(sync.mutePromoted, false, "other filters are off");
    assert.ok(!("soloPromoted" in sync), "the legacy solo key is gone, not merely falsified");
    assert.strictEqual(sync.nameNames, false, "display toggles are back to default");
    assert.strictEqual(sync.enabled, true);
  } finally { await close(); }
});

test("cancelling the factory-reset confirm changes nothing", { skip, timeout: 60000 }, async () => {
  const { page, sw, close } = await launchOptions({ local: DIRTY_LOCAL, sync: DIRTY_SYNC });
  try {
    await openPanels(page);
    page.on("dialog", (d) => d.dismiss());
    await page.click("#factory-reset");
    const store = await sw.evaluate((k) => new Promise((r) =>
      chrome.storage.local.get([k], (o) => r(o[k]))), AUTHORS_KEY);
    assert.strictEqual(Object.keys(store.muted).length, 2, "a dismissed confirm must not delete anything");
    const sync = await sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    assert.strictEqual(sync.mutePromoted, true, "settings untouched too");
  } finally { await close(); }
});

// --- FH-054: "Reset AI-slop learning" must reset the AI, and ONLY the AI -----------------

test("Reset AI-slop learning wipes the model but leaves the user's setup standing", { skip, timeout: 60000 }, async () => {
  // The bug: it removed the weights alone, so the training data, observations and self-tuned
  // threshold survived and auto-calibration rebuilt the same model from them. Driven against
  // real chrome.storage because that is the only place the leftovers are visible (§52).
  const { page, sw, close } = await launchOptions({ local: DIRTY_AI_LOCAL, sync: DIRTY_AI_SYNC });
  try {
    await openPanels(page);
    page.on("dialog", (d) => d.accept());
    await page.click("#reset-learning");
    await page.waitForFunction(() => /Learning reset/.test(document.getElementById("reset-learning").textContent));

    const local = await sw.evaluate(() => new Promise((r) => chrome.storage.local.get(null, r)));
    for (const k of ["feedhacker:slopWeights", "feedhacker:sloptrain", "feedhacker:slopobs", "feedhacker:slopcal", "feedhacker:sloplog"]) {
      assert.ok(!(k in local), `${k} must be gone — leaving it rebuilds the model`);
    }
    // ...and everything that is NOT the AI is untouched.
    assert.ok(local[AUTHORS_KEY], "muted/allowed authors survive an AI reset");
    assert.deepStrictEqual(Object.keys(local[AUTHORS_KEY].muted).sort(), ["acme-co", "jane-doe"]);
    assert.ok(local[CUSTOM_KEY], "custom filters survive");

    const sync = await sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    assert.strictEqual(sync.mutePromoted, true, "mute choices are not the AI's to reset");
    assert.strictEqual(sync.nameNames, true, "nor display settings");
    assert.strictEqual(sync.nameNames, true, "nor display settings");
    assert.strictEqual(sync.muteSloppy, false, "nor even whether the AI filter is switched on");
    // The AI's own tuning IS reset, back to the shipped default.
    assert.strictEqual(sync.slopThreshold, 0.5, "the self-tuned cutoff goes back to the default");
  } finally { await close(); }
});

test("cancelling the AI-reset confirm changes nothing", { skip, timeout: 60000 }, async () => {
  const { page, sw, close } = await launchOptions({ local: DIRTY_AI_LOCAL, sync: DIRTY_AI_SYNC });
  try {
    await openPanels(page);
    page.on("dialog", (d) => d.dismiss());
    await page.click("#reset-learning");
    const local = await sw.evaluate(() => new Promise((r) => chrome.storage.local.get(null, r)));
    assert.ok(local[WEIGHTS_KEY], "a dismissed confirm must not delete the model");
    const sync = await sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    assert.strictEqual(sync.slopThreshold, 0.43, "nor restore its tuning");
  } finally { await close(); }
});
