"use strict";
// System (E2E): the toolbar popup's mixer, driven in real headless Chromium against real
// chrome.storage.
//
// Why this exists: solo was removed in 0.8.0 and the AI-slop toggle moved OUT of the generated
// filter list into its own section as STATIC markup in popup.html, wired by the same
// querySelectorAll(".ms") that wires the generated rows. That split is exactly the kind of thing
// that typechecks, unit-tests green, and then does nothing when clicked — the markup and the
// wiring can disagree and only a browser can tell you.
const test = require("node:test");
const assert = require("node:assert");
const { resolveChrome, extensionBuilt, launchPopup } = require("./helper");

const browser = resolveChrome();
const skip = process.env.CI
  ? false
  : !browser.ok
  ? "no Chromium available (run `npx playwright install chromium`)"
  : !extensionBuilt()
  ? "extension not built (run `npm run build`)"
  : false;

// Raw sync, deliberately: a fresh install writes NOTHING to sync (the defaults are supplied at
// read time by chrome.storage.sync.get(DEFAULTS, …)), so an untouched key is ABSENT, not false.
// That distinction is the point of these assertions — it proves a click wrote only its own key.
const readSync = (sw) => sw.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
const painted = (page, key) =>
  page.$eval(`.ms[data-key="${key}"]`, (b) => b.classList.contains("m-on"));

// popup.html ships the .ms buttons AND #enabled as static markup, so waitForSelector on any of
// them resolves the moment the DOM parses — which is well before popup.js's async
// chrome.storage.sync.get callback has painted anything. (The generated #filters .frow rows are
// no better: they are built synchronously at module top level, not in that callback.) Asserting
// painted state on either signal is therefore a RACE, and it is the kind that hides: the AI-slop
// case passed 29/29 on four consecutive CI runs and then failed on a loaded runner with
// `false !== true`, on a pull request whose diff was three markdown files.
//
// #enabled is the one unambiguous "the settings callback has run" signal. It is static and
// UNCHECKED in the HTML, `enabled` defaults to TRUE, and nothing but that callback can check it.
// Crucially it is independent of muteSloppy, so waiting on it does NOT make the assertion it
// guards vacuous — if the paint ran and the AI toggle came up off, the test still fails, which
// is the entire point of the case. (Waiting for `m-on` itself would have "fixed" the flake by
// turning a real assertion into a timeout — best_practices §54.)
const settingsPainted = (page) =>
  page.waitForFunction(() => document.getElementById("enabled")?.checked === true, { timeout: 20000 });

test("the popup loads without a script error and renders the mixer", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchPopup({});
  try {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.waitForSelector("#filters .frow", { timeout: 20000 });
    assert.deepStrictEqual(errors, [], "no uncaught error on load");
    // Every row is a single M — no S survives anywhere in the rendered popup.
    const kinds = await page.$$eval(".ms", (bs) => bs.map((b) => b.textContent.trim()));
    assert.ok(kinds.length > 0, "the mixer rendered");
    assert.deepStrictEqual([...new Set(kinds)], ["M"], "solo buttons are gone from the UI");
  } finally { await close(); }
});

test("the AI-slop toggle is real: clicking it writes muteSloppy", { skip, timeout: 60000 }, async () => {
  // The static-markup button. Default is ON, so one click must turn it OFF in real storage.
  const { page, sw, close } = await launchPopup({});
  try {
    await page.waitForSelector('.ms[data-key="muteSloppy"]', { timeout: 20000 });
    await settingsPainted(page);
    assert.strictEqual(await painted(page, "muteSloppy"), true,
      "AI slop starts on — painted from the shipped default, not from stored state");
    assert.ok(!("muteSloppy" in (await readSync(sw))),
      "…and a fresh install has written nothing to sync yet");

    await page.click('.ms[data-key="muteSloppy"]');
    await page.waitForFunction(
      () => !document.querySelector('.ms[data-key="muteSloppy"]').classList.contains("m-on"),
      { timeout: 10000 });
    assert.strictEqual((await readSync(sw)).muteSloppy, false, "the click reached storage");

    await page.click('.ms[data-key="muteSloppy"]');
    await page.waitForFunction(
      () => document.querySelector('.ms[data-key="muteSloppy"]').classList.contains("m-on"),
      { timeout: 10000 });
    assert.strictEqual((await readSync(sw)).muteSloppy, true, "and it toggles back");
  } finally { await close(); }
});

test("the AI-slop toggle is NOT duplicated in the kind list", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchPopup({});
  try {
    await page.waitForSelector("#filters .frow", { timeout: 20000 });
    const inList = await page.$$eval("#filters .ms", (bs) => bs.map((b) => b.dataset.key));
    assert.ok(!inList.includes("muteSloppy"),
      "AI slop lives in its own section, not among the plain kind toggles");
    assert.ok(inList.includes("mutePromoted"), "…and the ordinary kinds are still listed");
  } finally { await close(); }
});

test("a plain kind toggle still writes its own key and nothing else", { skip, timeout: 60000 }, async () => {
  const { page, sw, close } = await launchPopup({});
  try {
    await page.waitForSelector('.ms[data-key="mutePromoted"]', { timeout: 20000 });
    await settingsPainted(page);   // same race: do not click a button the first paint has not reached
    await page.click('.ms[data-key="mutePromoted"]');
    await page.waitForFunction(
      () => document.querySelector('.ms[data-key="mutePromoted"]').classList.contains("m-on"),
      { timeout: 10000 });
    const sync = await readSync(sw);
    assert.strictEqual(sync.mutePromoted, true, "the toggle wrote its key");
    assert.ok(!("muteSloppy" in sync), "and did not touch the AI toggle");
    assert.ok(!("muteHiring" in sync), "nor any other kind");
    assert.strictEqual(await painted(page, "muteSloppy"), true, "the AI is still shown as on");
  } finally { await close(); }
});

test("a legacy solo key in sync is evicted, and hides nothing", { skip, timeout: 60000 }, async () => {
  // The upgrade path: an install that had Solo on. Opening the feed evicts the key; the popup
  // must never render a control for it either.
  const { page, sw, close } = await launchPopup({ sync: { soloHiring: true, mutePromoted: true } });
  try {
    await page.waitForSelector("#filters .frow", { timeout: 20000 });
    const keys = await page.$$eval(".ms", (bs) => bs.map((b) => b.dataset.key));
    assert.ok(!keys.some((k) => /^solo/.test(k)), "no solo control is rendered for a legacy key");
    const sync = await readSync(sw);
    assert.strictEqual(sync.mutePromoted, true, "the user's real settings survive the upgrade");
  } finally { await close(); }
});
