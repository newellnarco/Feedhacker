"use strict";
// Integration: solo mode is GONE, and a pre-0.8.0 install that had it on is safe (FH-057).
//
// Solo showed *only* the soloed kinds and hid everything else, so one click could empty a whole
// feed. Every "FeedHacker is hiding everything" report this project ever received traced to it;
// none traced to the AI. It also short-circuited BEFORE the scorer, which silently switched the
// AI-slop model off and froze its decision log for as long as it was on — which is why three
// consecutive log exports came back with 13-day-old data.
//
// The risk in removing it is not the deletion, it is the LEFTOVER STATE: installs still carry
// "solo<Key>": true in chrome.storage.sync. A stale truthy key must not be able to hide anything,
// must not count as an active filter, and must not survive in storage. These cases pin that.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

function baseSettings(over) {
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() }, over || {});
}
function feedHtml(b) { return `<!doctype html><html><body><main><div id="feed">${b}</div></main></body></html>`; }
let urn = 0;
function post(inner) {
  return `<div class="post" data-urn="urn:li:activity:${++urn}"><h2>Feed post</h2>${inner}</div>`;
}
const HUMAN = "<div>Fixed a caching bug this morning, tests pass, shipping the patch after lunch.</div>";
const AD = "<span>Promoted</span><div>buy our thing today</div>";

test("a stale soloHiring from an old install hides NOTHING", () => {
  // The exact state the reporting install was stuck in: soloHiring true, nothing muted.
  // Pre-0.8.0 this hid every post that was not a hiring ad. It must now be completely inert.
  const doc = makeDoc(feedHtml(post(HUMAN) + post(AD)));
  const settings = baseSettings({ muteSloppy: false, soloHiring: true });
  for (const el of feed.findPostContainers(doc)) {
    assert.strictEqual(feed.consider(doc, el, [], settings), null, "a legacy solo key hides nothing");
    assert.ok(!el.classList.contains("feedhacker-hidden"));
  }
});

test("a stale solo key cannot override a mute, in either direction", () => {
  // Solo used to outrank mute (that collision was FH-056). With solo gone, mute is simply mute.
  const doc = makeDoc(feedHtml(post(AD) + post(HUMAN)));
  const [ad, human] = feed.findPostContainers(doc);
  const settings = baseSettings({ muteSloppy: false, mutePromoted: true, soloHiring: true });
  assert.ok(feed.consider(doc, ad, [], settings), "the muted kind is still hidden");
  assert.strictEqual(feed.consider(doc, human, [], settings), null,
    "and the stale solo key does not hide everything else");
});

test("the feed layer no longer understands solo at all", () => {
  // Guard against a half-removal: no 'filtered' verdict, no unsolo control, no exit handler.
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "..", "src", "feed.ts"), "utf8");
  assert.ok(!/listActive\((?:s|settings), "solo"\)/.test(src), "nothing lists soloed kinds");
  assert.ok(!src.includes('data-fh-act", "unsolo"'), "no unsolo control is rendered");
  assert.ok(!src.includes("onClearSolo"), "no solo-exit handler is referenced");
  assert.ok(!src.includes("Solo mode: showing only"), "the solo stub label is gone");
});

// --- the migration ---------------------------------------------------------------------------

test("buildDefaults ships no solo keys at all", () => {
  const d = filters.buildDefaults();
  const solo = Object.keys(d).filter((k) => /^solo[A-Z]/.test(k));
  assert.deepStrictEqual(solo, [], "a fresh install has no solo state to inherit");
});

test("applyFixed DELETES legacy solo keys rather than merely ignoring them", () => {
  // Ignoring is not enough: the keys would keep syncing between devices and would reappear in
  // any future code that enumerated settings. They are removed from the live object every load.
  const s = Object.assign(filters.buildDefaults(), { soloHiring: true, soloPromoted: false });
  filters.applyFixed(s);
  assert.ok(!("soloHiring" in s), "a truthy legacy key is deleted");
  assert.ok(!("soloPromoted" in s), "a falsy one is deleted too");
  assert.strictEqual(s.muteSloppy, true, "and the real settings are untouched");
});

test("legacySoloKeys names exactly what content.ts must evict from storage", () => {
  const keys = filters.legacySoloKeys({
    soloHiring: true, soloPromoted: false, muteSloppy: true, enabled: true, solo: 1, soloing: 2,
  });
  assert.deepStrictEqual(keys.sort(), ["soloHiring", "soloPromoted"],
    "only real solo<Key> settings — not 'solo', not 'soloing', not mutes");
});

test("applyFixed is defensive about junk", () => {
  assert.strictEqual(filters.applyFixed(null), null);
  assert.deepStrictEqual(filters.dropLegacySolo({}), {});
});
