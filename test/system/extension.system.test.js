"use strict";
// System (E2E): the packaged extension, loaded into real headless Chromium, must
// hide the right posts on a LinkedIn-shaped page — the full stack the unit and
// integration tests only simulate (manifest, content-script injection, storage,
// MutationObserver, badge messaging). Skips cleanly where no browser is available.
const test = require("node:test");
const assert = require("node:assert");
const { resolveChrome, extensionBuilt, launchFeed } = require("./helper");

const browser = resolveChrome();
// In CI we must never silently skip — a missing browser or unbuilt extension should
// fail the `system` job loudly, not publish an untested build. Skipping is only for
// local sandboxes without a browser.
const skip = process.env.CI
  ? false
  : !browser.ok
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

const RUN_FIXTURE = `<!doctype html><html><head><title>Feed</title></head><body><main><div id="feed">
  ${[0, 1, 2, 3].map((i) => post("promo-" + i, `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy thing ${i}</div>`)).join("\n")}
  ${post("p-ok", `<div>Fixed a caching bug this morning, tests pass, shipping later.</div>`)}
</div></main></body></html>`;

test("folds a run of hidden posts into one group row end-to-end", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({ fixtureHtml: RUN_FIXTURE, sync: { mutePromoted: true } });
  try {
    await page.waitForSelector(".feedhacker-stub.feedhacker-group", { timeout: 20000 });
    const summary = await page.locator(".feedhacker-stub.feedhacker-group").first().innerText();
    assert.match(summary, /4 posts hidden/, "group row summarizes the run size");
    // The run's later members are folded away (no stub); the human post stays visible.
    const goneStubs = await page.locator("#promo-3 .feedhacker-stub").count();
    assert.strictEqual(goneStubs, 0, "a folded member has no individual stub");
    const okHidden = await page.locator("#p-ok").evaluate((el) => el.classList.contains("feedhacker-hidden"));
    assert.strictEqual(okHidden, false, "the human post that breaks the run stays visible");
    // Expanding restores individual stubs.
    await page.locator('.feedhacker-group [data-fh-act="ungroup"]').click();
    await page.waitForSelector("#promo-3 .feedhacker-stub", { timeout: 10000 });
  } finally {
    await close();
  }
});

test("leaves the Promoted post visible under default settings (Promoted muting off)", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({ fixtureHtml: FIXTURE, sync: {} });
  try {
    // Positive control: wait until the content script has actually scanned the post
    // (data-feedhacker-scanned), so this can't pass vacuously if the extension never
    // booted. THEN assert that, with Promoted muting off, it was not hidden.
    await page.waitForSelector("#p-ad[data-feedhacker-scanned]", { timeout: 20000 });
    const adHidden = await page.locator("#p-ad").evaluate((el) => el.classList.contains("feedhacker-hidden"));
    assert.strictEqual(adHidden, false, "Promoted post must remain visible when the filter is off");
  } finally {
    await close();
  }
});

// --- FH-043: Mute must key on the post's AUTHOR, in a real browser -------------------
// This is the case that only a browser reproduces honestly: by the time the user clicks
// Mute, `.feedhacker-hidden > *:not(.feedhacker-stub) { display:none }` has taken effect,
// so re-deriving the author from the live DOM reads our own stub back. On a reshare the
// reactor's profile link also comes first, so the old code muted the wrong person and the
// author kept appearing. The identity is now captured while the post is still visible.
const RESHARE_FIXTURE = `<!doctype html><html><head><title>Feed</title></head><body><main><div id="feed">
  ${post("p-reshare", `
    <div><a href="/in/reactor-rita">Rita Reactor</a> likes this</div>
    <div><a href="/in/author-alice">Alice Author</a></div>
    <div>2h</div>
    <div>Original commentary from Alice about her week.</div>`)}
  ${post("p-alice", `
    <div><a href="/in/author-alice">Alice Author</a></div>
    <div>1h</div>
    <div>Fixed a caching bug this morning, tests pass, shipping later.</div>`)}
  ${post("p-dana", `
    <div><a href="/in/dana-dev">Dana Dev</a></div>
    <div>30m</div>
    <div>Notes from the incident review are up on the wiki.</div>`)}
</div></main></body></html>`;

test("Mute on a reshare stub mutes the author, not the reactor", { skip, timeout: 60000 }, async () => {
  // "Reaction reshares" is a deterministic filter, so this test never depends on the model.
  const { ctx, page, close } = await launchFeed({ fixtureHtml: RESHARE_FIXTURE, sync: { muteLikes: true } });
  try {
    await page.waitForSelector("#p-reshare .feedhacker-stub", { timeout: 20000 });
    // Positive control: Alice's own post is visible before the mute.
    await page.waitForSelector("#p-alice[data-feedhacker-scanned]", { timeout: 20000 });
    const aliceBefore = await page.locator("#p-alice").evaluate((el) => el.classList.contains("feedhacker-gone"));
    assert.strictEqual(aliceBefore, false, "Alice's plain post starts visible");

    await page.locator('#p-reshare [data-fh-act="mute"]').click();

    // Muting Alice must take her other post out of the feed outright (a soft block: no stub).
    // state:"attached" — a soft-blocked post is display:none, so it is never "visible".
    await page.waitForSelector("#p-alice.feedhacker-gone", { state: "attached", timeout: 20000 });
    assert.strictEqual(await page.locator("#p-alice .feedhacker-stub").count(), 0,
      "a muted author's post leaves no placeholder");
    const danaGone = await page.locator("#p-dana").evaluate((el) => el.classList.contains("feedhacker-gone"));
    assert.strictEqual(danaGone, false, "an unrelated author is untouched — the reactor was not muted");

    // …and it is persisted immediately, not left in a debounce window a reload would drop.
    // Read it back through the service worker — the page's main world has no chrome.storage.
    const sw = ctx.serviceWorkers()[0];
    const stored = await sw.evaluate(() => new Promise((r) =>
      chrome.storage.local.get("feedhacker:authors", (o) => r(o["feedhacker:authors"] || {}))));
    assert.deepStrictEqual(Object.keys(stored.muted || {}), ["/in/author-alice"],
      "the author's profile path is what got muted");
  } finally {
    await close();
  }
});

// --- FH-044: the AI-slop splat must be reachable on a folded run --------------------
test("a folded group row exposes the AI-slop splat end-to-end", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({ fixtureHtml: RUN_FIXTURE, sync: { mutePromoted: true } });
  try {
    await page.waitForSelector(".feedhacker-stub.feedhacker-group", { timeout: 20000 });
    // Promoted posts are deterministic, so there is nothing for the model to learn from and
    // no splat is offered — only "Show all". (The splat's own behaviour is covered at the
    // integration tier, where the slop score can be set deterministically.)
    assert.strictEqual(await page.locator('.feedhacker-group [data-fh-act="confirm-group"]').count(), 0,
      "a run with no learnable slop in it offers no confirm control");
    // Expanding restores the individual stubs, each with its own controls.
    await page.locator('.feedhacker-group [data-fh-act="ungroup"]').click();
    await page.waitForSelector('#promo-3 [data-fh-act="hide"]', { timeout: 10000 });
    assert.ok((await page.locator('#promo-0 [data-fh-act="mute"]').count()) >= 1,
      "an expanded member carries its per-post author controls");
  } finally {
    await close();
  }
});

// --- FH-045: a feed of ordinary human posts must survive contact with the real extension.
// The scoring faults were only visible end-to-end: default settings, the packaged banlist,
// and the real auto-calibration all together. Every post below is human, and several carry
// the things the old model treated as proof of a machine — an em dash, an emoji, a
// three-item list, "leverage", "lessons learned".
const HUMAN_FEED = `<!doctype html><html><head><title>Feed</title></head><body><main><div id="feed">
  ${post("h-0", `<div><a href="/in/a0">Ana Reyes</a></div><div>2h</div>
    <div>Congrats to Priya on the promotion — very well deserved. She has carried that project for a year.</div>`)}
  ${post("h-1", `<div><a href="/in/a1">Ben Osei</a></div><div>3h</div>
    <div>We cut p99 latency from 800ms to 210ms by fixing one N+1 query. Sometimes it really is that dumb.</div>`)}
  ${post("h-2", `<div><a href="/in/a2">Cara Lin</a></div><div>4h</div>
    <div>Three things I am watching this quarter: pricing changes, churn in the SMB segment, and hiring velocity.</div>`)}
  ${post("h-3", `<div><a href="/in/a3">Dan Woods</a></div><div>5h</div>
    <div>We should leverage the new tooling and unpack the lessons learned from last quarter.</div>`)}
  ${post("h-4", `<div><a href="/in/a4">Eve Marsh</a></div><div>6h</div>
    <div>Our new office finally has decent coffee. Small win but I will take it.</div>`)}
  ${post("h-5", `<div><a href="/in/a5">Femi Adeyemi</a></div><div>7h</div>
    <div>Notes from yesterday's incident review are up on the internal wiki if anyone wants them.</div>`)}
</div></main></body></html>`;

test("a feed of ordinary human posts is left alone end-to-end", { skip, timeout: 60000 }, async () => {
  // Default settings: AI-slop muting is the one filter on out of the box.
  const { page, close } = await launchFeed({ fixtureHtml: HUMAN_FEED, sync: {} });
  try {
    // Positive control: wait until every post has actually been judged, so this cannot pass
    // vacuously by the content script never having run.
    for (let i = 0; i < 6; i++) {
      await page.waitForSelector(`#h-${i}[data-feedhacker-scanned]`, { timeout: 20000 });
    }
    const hidden = [];
    for (let i = 0; i < 6; i++) {
      const isHidden = await page.locator(`#h-${i}`).evaluate((el) =>
        el.classList.contains("feedhacker-hidden") || el.classList.contains("feedhacker-gone"));
      if (isHidden) hidden.push(`h-${i}`);
    }
    assert.deepStrictEqual(hidden, [], `no human post may be hidden by default (hid ${hidden.join(", ")})`);
    assert.strictEqual(await page.locator(".feedhacker-stub").count(), 0, "and no stubs are inserted");
  } finally {
    await close();
  }
});
