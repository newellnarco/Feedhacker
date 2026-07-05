"use strict";
// System (E2E): the packaged extension, loaded into real headless Chromium, must
// hide the right posts on a LinkedIn-shaped page — the full stack the unit and
// integration tests only simulate (manifest, content-script injection, storage,
// MutationObserver, badge messaging). Skips cleanly where no browser is available.
const test = require("node:test");
const assert = require("node:assert");
const { resolveChrome, extensionBuilt, launchFeed } = require("./helper");

const browser = resolveChrome();
const skip = !browser.ok
  ? "no Chromium available (run `npx playwright install chromium`)"
  : !extensionBuilt()
  ? "extension not built (run `npm run build`)"
  : false;

const post = (id, inner) => `<div class="post" id="${id}"><h2>Feed post</h2>${inner}</div>`;
const FIXTURE = `<!doctype html><html><head><title>Feed</title></head><body><main><div id="feed">
  ${post("p-ad", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing</div>`)}
  ${post("p-ok", `<div>Fixed a caching bug this morning, tests pass, shipping later.</div>`)}
</div></main></body></html>`;

test("hides a Promoted post end-to-end when Promoted muting is on", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({ fixtureHtml: FIXTURE, sync: { mutePromoted: true } });
  try {
    await page.waitForSelector("#p-ad.feedhacker-hidden", { timeout: 20000 });
    const okHidden = await page.locator("#p-ok").evaluate((el) => el.classList.contains("feedhacker-hidden"));
    assert.strictEqual(okHidden, false, "a normal human post must stay visible");
    assert.ok((await page.locator("#p-ad .feedhacker-stub").count()) >= 1, "a collapse stub is inserted");
  } finally {
    await close();
  }
});

test("leaves the Promoted post visible under default settings (Promoted muting off)", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({ fixtureHtml: FIXTURE, sync: {} });
  try {
    // Give the content script time to boot and scan; with Promoted muting off it must not hide it.
    await page.waitForTimeout(4000);
    const adHidden = await page.locator("#p-ad").evaluate((el) => el.classList.contains("feedhacker-hidden"));
    assert.strictEqual(adHidden, false, "Promoted post must remain visible when the filter is off");
  } finally {
    await close();
  }
});
