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
const DIRTY_SYNC = { muteSloppy: false, mutePromoted: true, soloPromoted: true, nameNames: true };

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

    // …and settings are exactly a clean install: AI slop on, nothing else, no solo.
    const sync = await sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    assert.strictEqual(sync.muteSloppy, true, "the default AI algorithm is back on");
    assert.strictEqual(sync.mutePromoted, false, "other filters are off");
    assert.strictEqual(sync.soloPromoted, false, "solo mode is off");
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
    assert.strictEqual(sync.soloPromoted, true, "settings untouched too");
  } finally { await close(); }
});
