"use strict";
// System (E2E): the packaged extension, loaded into real headless Chromium, must
// hide the right posts on a LinkedIn-shaped page — the full stack the unit and
// integration tests only simulate (manifest, content-script injection, storage,
// MutationObserver, badge messaging). Skips cleanly where no browser is available.
const test = require("node:test");
const assert = require("node:assert");
const { resolveChrome, extensionBuilt, extensionWorker, launchFeed } = require("./helper");

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

// FH-053: LinkedIn's own feed modules wear the same hidden "Feed post" heading a real post
// does. Mute has no prose gate, so before the guard these were hidden as if a member had
// written them. (Solo, which hid everything off-category, was removed in 0.8.0 — this case used
// to run under it and reads the same under mute.) Driven in a real browser because a
// scan change is only done on the live feed (best_practices §28): the module carries no
// per-post overflow control, the real post does, and that asymmetry is what tells them apart.
const FURNITURE_FIXTURE = `<!doctype html><html><head><title>Feed</title></head><body><main><div id="feed">
  <div class="post" id="p-mod"><h2>Feed post</h2><div>Who's viewed your profile</div><div><a href="/in/steve-hawkins">Steve Hawkins</a> - 1st Director of Security</div></div>
  ${post("p-ad", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing</div>`)}
  ${post("p-human", `<button aria-label="Open control menu for post by Avery Lindqvist"></button><div>Fixed a caching bug this morning, tests pass, shipping later.</div>`)}
</div></main></body></html>`;

test("a mute never hides LinkedIn's own feed modules end-to-end", { skip, timeout: 60000 }, async () => {
  // Mute Promoted: the ad is hidden, the module is left alone, the human post is untouched.
  const { page, close } = await launchFeed({ fixtureHtml: FURNITURE_FIXTURE, sync: { mutePromoted: true } });
  try {
    await page.waitForSelector("#p-ad.feedhacker-hidden", { timeout: 20000 });
    const modHidden = await page.locator("#p-mod").evaluate((el) => el.classList.contains("feedhacker-hidden"));
    assert.strictEqual(modHidden, false, "a LinkedIn module must never be hidden");
    const marked = await page.locator("#p-mod").evaluate((el) => el.dataset.feedhackerFurniture);
    assert.strictEqual(marked, "1", "and be recognised as furniture, not judged as a post");
    const humanHidden = await page.locator("#p-human").evaluate((el) => el.classList.contains("feedhacker-hidden"));
    assert.strictEqual(humanHidden, false, "muting one kind must not touch anything else");
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
    const sw = await extensionWorker(ctx);
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

// FH-060: how OFTEN a post is judged, driven in a real browser — the only tier that runs the
// real debounced storage writes, the real storage.onChanged delivery back into the same tab,
// and the real MutationObserver together. The maintainer's 0.8.0 export had 300 decisions
// over 5 distinct posts, 1548ms apart in lockstep: hiding a post bumped its author's hide
// tally, the tally write came back to our own tab, and the handler re-applied the whole feed
// — dropping every model verdict and re-judging everything, forever. Unit and integration
// tests cannot see it; each of those pieces is individually correct.
//
// The invariant is the one the export should have shown: decisions ~ distinct posts.
const SLOP_A = "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
const SLOP_B = "Here’s the thing: this isn’t just a meeting — it’s a movement. The takeaway? Focus, courage, and clarity. Here’s why nobody tells you: it’s not about headcount. It’s about culture. 🚀 Think bigger. 💡 Move faster. 🔥 Stay curious.";
const SLOP_C = "Let’s be honest: this isn’t just a product — it’s a promise. The best part? Trust, speed, and delight. Here’s what nobody tells you: it’s not about features. It’s about outcomes. 🚀 Ship often. 💡 Listen harder. 🔥 Stay humble.";
// NOTE the explicit charset: the harness fulfils with contentType "text/html" and no charset,
// so Chrome would decode this fixture's curly quotes and emoji as windows-1252 and the scorer
// would see mojibake. Every other fixture here is pure ASCII and never noticed.
const FLOOD_FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title></head><body><main><div id="feed">
  ${post("p-s1", `<a href="/in/ann-one">Ann One</a><div>${SLOP_A}</div>`)}
  ${post("p-s2", `<a href="/in/bob-two">Bob Two</a><div>${SLOP_B}</div>`)}
  ${post("p-s3", `<a href="/in/cid-three">Cid Three</a><div>${SLOP_C}</div>`)}
  ${post("p-ok", `<a href="/in/dee-four">Dee Four</a><div>Fixed a caching bug this morning, tests pass, shipping later.</div>`)}
</div></main></body></html>`;

test("a post is judged once, not on a loop — decisions stay ~ distinct posts", { skip, timeout: 90000 }, async () => {
  // extId comes from the launcher, which resolved the extension's own worker while it was
  // certainly alive — an MV3 worker may well be idle by the time the dwell below ends.
  const { ctx, page, extId, close } = await launchFeed({ fixtureHtml: FLOOD_FIXTURE, sync: { muteSloppy: true } });
  try {
    await page.waitForSelector("#p-s1.feedhacker-hidden", { timeout: 20000 });
    // Dwell without touching anything. The loop needed no input: its clock was the 1.5s
    // author-tally debounce, so ~4 turns fit in here and each turn re-judged all three.
    await page.waitForTimeout(7000);

    // Read the log the way the maintainer does — from the options page, which has the
    // chrome.* APIs in its own page context. NOT from the service worker: an MV3 worker is
    // free to go idle during the dwell above, and evaluating in a stopped worker hangs
    // rather than failing (best_practices §65).
    const read = async (key) => {
      const o = await ctx.newPage();
      await o.goto(`chrome-extension://${extId}/options.html`, { waitUntil: "domcontentloaded" });
      const v = await o.evaluate((k) => new Promise((r) =>
        chrome.storage.local.get([k], (got) => r((got && got[k]) || []))), key);
      await o.close();
      return v;
    };
    const log = await read("feedhacker:sloplog");

    const distinct = new Set(log.map((e) => e && e.preview)).size;
    assert.ok(log.length >= 3,
      `the three slop posts must actually reach the decision log (got ${log.length}) — a test that logs nothing proves nothing`);
    assert.ok(log.length <= distinct * 2,
      `decisions must stay ~ distinct posts: ${log.length} decisions over ${distinct} distinct posts ` +
      `is the FH-060 flood (it was 300 over 5)`);

    // …and the population auto-calibration learns from must be just as clean, because that is
    // where the real damage landed: broetry damped 1.400 -> 0.792 on duplicates of a handful.
    const obs = await read("feedhacker:slopobs");
    assert.ok(obs.length <= 12,
      `the calibration population must not fill with re-sightings of 4 posts (got ${obs.length})`);
  } finally {
    await close();
  }
});

// FH-061: a group row stands for ONE reason. Driven in a real browser because grouping is a
// scan-path change (§28) and because the row's controls are what the maintainer was actually
// blocked by: *"one has the slop button and the other two don't, it won't let me click slop on
// the group so i have to expand them."*
const MIXED_FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title></head><body><main><div id="feed">
  ${post("p-slop", `<a href="/in/ann-one">Ann One</a><div>${SLOP_A}</div>`)}
  ${post("p-promo-1", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing one</div>`)}
  ${post("p-promo-2", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing two</div>`)}
  ${post("p-ok", `<div>Fixed a caching bug this morning, tests pass, shipping later.</div>`)}
</div></main></body></html>`;

test("AI slop and Promoted are never folded into one row end-to-end (FH-061)", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({
    fixtureHtml: MIXED_FIXTURE, sync: { muteSloppy: true, mutePromoted: true, groupHiddenRuns: true },
  });
  try {
    // Wait for the LAST of the three to be hidden, so grouping has certainly had its chance.
    // `state: "attached"` matters: a post folded into a group row is `feedhacker-gone`, i.e.
    // display:none, so the default "visible" wait can never be satisfied by the very state
    // this test is waiting for.
    await page.waitForSelector("#p-promo-2.feedhacker-hidden, #p-promo-2.feedhacker-gone",
      { state: "attached", timeout: 20000 });

    // The run is bucketed by reason, so the two Promoted posts DO get a row — and it stands
    // for those two alone. What must never appear is a row claiming both kinds.
    const rows = await page.locator(".feedhacker-stub.feedhacker-group").allInnerTexts();
    for (const t of rows) {
      assert.strictEqual(t.split("·").length <= 2, true, `a row claims more than one kind: ${JSON.stringify(t)}`);
      assert.ok(!(/AI Slop/.test(t) && /Promoted/.test(t)), `a row mixes slop and promoted: ${JSON.stringify(t)}`);
    }
    assert.ok(rows.some((t) => /2 posts hidden/.test(t) && /Promoted/.test(t)),
      `the promoted pair folds into its own row (rows: ${JSON.stringify(rows)})`);

    // The slop post keeps its own stub — and so its own splat, reachable without expanding
    // anything, which is what the maintainer was blocked by.
    assert.ok((await page.locator("#p-slop .feedhacker-stub").count()) >= 1, "the slop post keeps its own stub");
    assert.ok((await page.locator('#p-slop [data-fh-act="confirm"]').count()) >= 1,
      "the slop post's own splat is right there");
    assert.strictEqual(
      await page.locator("#p-ok").evaluate((el) => el.classList.contains("feedhacker-hidden")), false,
      "the human post stays visible");
  } finally {
    await close();
  }
});

// The maintainer's 2026-09-18 screenshot: seven consecutive stubs with grouping ON, because
// the kinds alternated and FH-061's rule wanted three NEIGHBOURS of one kind. Driven in a real
// browser because grouping runs on the scan path (§28) and because "it doesn't combine the like
// types" is a claim about what is on screen.
const ALT_FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title></head><body><main><div id="feed">
  ${post("a-slop-1", `<a href="/in/ann-one">Ann One</a><div>${SLOP_A}</div>`)}
  ${post("a-promo-1", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing one</div>`)}
  ${post("a-slop-2", `<a href="/in/bob-two">Bob Two</a><div>${SLOP_B}</div>`)}
  ${post("a-promo-2", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing two</div>`)}
  ${post("a-slop-3", `<a href="/in/cat-three">Cat Three</a><div>${SLOP_A}</div>`)}
  ${post("a-promo-3", `<a href="/company/acme">Acme</a><span>Promoted</span><div>buy our thing three</div>`)}
</div></main></body></html>`;

test("alternating kinds still group, one row per kind, end-to-end", { skip, timeout: 60000 }, async () => {
  const { page, close } = await launchFeed({
    fixtureHtml: ALT_FIXTURE, sync: { muteSloppy: true, mutePromoted: true, groupHiddenRuns: true },
  });
  try {
    await page.waitForSelector("#a-promo-3.feedhacker-hidden, #a-promo-3.feedhacker-gone",
      { state: "attached", timeout: 20000 });   // folded members are display:none — see above
    await page.waitForSelector(".feedhacker-stub.feedhacker-group", { timeout: 20000 });

    const rows = await page.locator(".feedhacker-stub.feedhacker-group").allInnerTexts();
    assert.strictEqual(rows.length, 2, `one row per kind, not per neighbour-run (rows: ${JSON.stringify(rows)})`);
    assert.ok(rows.some((t) => /AI Slop/.test(t)), `an AI Slop row: ${JSON.stringify(rows)}`);
    assert.ok(rows.some((t) => /Promoted/.test(t)), `a Promoted row: ${JSON.stringify(rows)}`);
    for (const t of rows) assert.match(t, /3 posts hidden/, `each row stands for its own three: ${JSON.stringify(t)}`);

    // The rows sit where their first member sat: the feed is not reordered to group it.
    assert.ok(await page.locator("#a-slop-1 .feedhacker-stub.feedhacker-group").count() >= 1,
      "the first slop post heads the slop row, in place");
    assert.ok(await page.locator("#a-promo-1 .feedhacker-stub.feedhacker-group").count() >= 1,
      "the first promoted post heads the promoted row, in place");

    // And the slop row's splat covers the whole row, which is only true because the row is
    // homogeneous — the FH-061 invariant surviving the change that relaxed adjacency.
    const slopRow = page.locator(".feedhacker-stub.feedhacker-group", { hasText: "AI Slop" });
    assert.ok(await slopRow.locator('[data-fh-act="confirm-group"]').count() >= 1,
      "the slop row offers the group splat");
    const promoRow = page.locator(".feedhacker-stub.feedhacker-group", { hasText: "Promoted" });
    assert.strictEqual(await promoRow.locator('[data-fh-act="confirm-group"]').count(), 0,
      "the promoted row does not — there is no model behind that hide");
  } finally {
    await close();
  }
});

// FH-062: "this is AI slop" on a post FeedHacker chose to SHOW. Driven in a real browser for
// two reasons a simulation cannot cover. The control is injected into a post we do not own, so
// only a real page proves it is reachable and clickable at all (§28) — and the label has to
// travel the whole way, through the delegated click, the verdict queue and a debounced
// storage write, into feedhacker:sloptrain. A jsdom test can prove the callback fired; only
// this can prove the training example was persisted.
const MARK_HUMAN = "Fixed a caching bug this morning: the key included a timestamp, so every lookup missed and we were hammering the database on every page load. Tests pass and I am shipping the patch after lunch, then writing up what we learned about cache keys for the team wiki.";
const MARK_FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title></head><body><main><div id="feed">
  ${post("p-human", `<a href="/in/dee-four">Dee Four</a><div>${MARK_HUMAN}</div>`)}
  ${post("p-s1", `<a href="/in/ann-one">Ann One</a><div>${SLOP_A}</div>`)}
</div></main></body></html>`;

test("marking a SHOWN post as slop hides it and persists a positive label", { skip, timeout: 90000 }, async () => {
  const { ctx, page, extId, close } = await launchFeed({ fixtureHtml: MARK_FIXTURE, sync: { muteSloppy: true } });
  try {
    // The model hides the slop post and shows the human one — the control belongs on the
    // second, and asserting that ordering first means a mis-scored fixture can't pass.
    await page.waitForSelector("#p-s1.feedhacker-hidden", { timeout: 20000 });
    assert.strictEqual(
      await page.locator("#p-human").evaluate((el) => el.classList.contains("feedhacker-hidden")), false,
      "the human post is shown — that is the case this control exists for");
    assert.strictEqual(await page.locator("#p-s1 .feedhacker-mark").count(), 0,
      "a hidden post has its stub instead");

    const btn = page.locator('#p-human [data-fh-act="mark-slop"]');
    await btn.waitFor({ state: "attached", timeout: 10000 });
    await btn.click({ force: true });          // force: the bar is deliberately faint until hover

    await page.waitForSelector("#p-human.feedhacker-hidden", { timeout: 10000 });
    assert.ok((await page.locator("#p-human .feedhacker-stub").count()) >= 1,
      "…and it collapses to a normal stub, so Show anyway is the undo");

    // The whole point: a POSITIVE example now exists in the training buffer.
    const read = async (key) => {
      const o = await ctx.newPage();
      await o.goto(`chrome-extension://${extId}/options.html`, { waitUntil: "domcontentloaded" });
      const v = await o.evaluate((k) => new Promise((r) =>
        chrome.storage.local.get([k], (got) => r((got && got[k]) || []))), key);
      await o.close();
      return v;
    };
    let train = [];
    for (let i = 0; i < 10 && train.length === 0; i++) {   // the verdict queue writes async
      train = await read("feedhacker:sloptrain");
      if (train.length === 0) await page.waitForTimeout(500);
    }
    assert.strictEqual(train.length, 1, "exactly one training example was persisted");
    assert.strictEqual(train[0].label, 1,
      "…and it is POSITIVE — before this, only label 0 could ever be recorded from the feed");
    assert.ok(typeof train[0].features.broetry === "number",
      "trained on the real feature vector of the post that was shown");
  } finally {
    await close();
  }
});
