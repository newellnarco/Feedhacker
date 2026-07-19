"use strict";
// System (E2E): the heartbeat "selectors out of date" alarm, exercised through the PACKAGED
// extension in real headless Chromium — the tier the unit/integration tests only simulate.
// Proves the LinkedIn-paging false alarm is gone end-to-end: an empty/paging feed stays silent,
// while a feed that rendered posts our marker no longer matches trips the alarm exactly once.
const test = require("node:test");
const assert = require("node:assert");
const { resolveChrome, extensionBuilt, launchFeed } = require("./helper");

const browser = resolveChrome();
const skip = process.env.CI
  ? false
  : !browser.ok
  ? "no Chromium available (run `npx playwright install chromium`)"
  : !extensionBuilt()
  ? "extension not built (run `npm run build`)"
  : false;

const ERR_KEY = "feedhacker:errorlog";
const feed = (inner) => `<!doctype html><html><head><title>Feed</title></head><body><main><div id="feed">${inner}</div></main></body></html>`;
// Posts LinkedIn rendered (role=article / activity-URN) but WITHOUT our "Feed post" marker heading
// — the genuine "selectors out of date" condition.
const BREAK_FIXTURE = feed(
  '<div role="article"><div>a post the marker no longer matches</div></div>' +
  '<div data-urn="urn:li:activity:2"><div>another post</div></div>' +
  '<div data-urn="urn:li:activity:3"><div>and another</div></div>'
);
const EMPTY_FIXTURE = feed("");   // paging / between page loads: no markers AND no posts

async function heartbeatCount(ctx) {
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const log = await sw.evaluate(
    (k) => new Promise((r) => chrome.storage.local.get([k], (o) => r((o && o[k]) || []))),
    ERR_KEY
  );
  return log.filter((e) => e && e.context === "heartbeat").length;
}

// Nudge the feed so the content script's observer runs another heartbeat scan, without adding a
// post marker or changing the post count (so a break stays a break, an empty feed stays empty).
async function nudge(page, times) {
  for (let i = 0; i < times; i++) {
    await page.evaluate((i) => {
      const d = document.createElement("div");
      d.textContent = "nudge" + i;
      document.getElementById("feed").appendChild(d);
    }, i);
    await page.waitForTimeout(500);
  }
}

test("empty/paging feed stays silent end-to-end", { skip, timeout: 60000 }, async () => {
  const { ctx, page, close } = await launchFeed({ fixtureHtml: EMPTY_FIXTURE });
  try {
    await page.bringToFront();
    await nudge(page, 6);   // multiple scans, well past the 3-run threshold
    assert.strictEqual(await heartbeatCount(ctx), 0, "an empty feed must never trip the heartbeat");
  } finally {
    await close();
  }
});

test("a genuine selector break alarms exactly once end-to-end", { skip, timeout: 60000 }, async () => {
  const { ctx, page, close } = await launchFeed({ fixtureHtml: BREAK_FIXTURE });
  try {
    await page.bringToFront();
    await page.waitForSelector('#feed [role="article"]', { timeout: 20000 });
    await nudge(page, 6);
    let count = 0;
    for (let i = 0; i < 20 && count < 1; i++) {
      count = await heartbeatCount(ctx);
      if (!count) await page.waitForTimeout(500);
    }
    assert.strictEqual(count, 1, "a genuine selector break is surfaced exactly once");
  } finally {
    await close();
  }
});
