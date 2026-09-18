"use strict";
// Unit: every control the feed renders must be explained in the options page's help.
//
// This exists because of a real gap the maintainer found, not a hypothetical one. 0.9.0 shipped
// the AI-slop splat on posts FeedHacker *shows* (FH-062) — the only control that can tell the
// model it MISSED a post — and nothing in the product said it existed. The help panel still
// opened "The icon buttons on each hidden-post stub", which was true before that release and
// false after it. The same audit found "Hide again" had never been documented at all, though it
// has fed label-1 corrections since 0.2.0.
//
// A control nobody knows about is worth nothing on a feature whose whole point is discoverability:
// the mark is deliberately low-weight (opacity .28 until you hover the post), so a user who is
// not told will not find it. Hence a test rather than a note: adding a `data-fh-act` to
// src/feed.ts now fails the unit tier until options.html explains it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const feed = read("src/feed.ts");
const options = read("options.html");
const popup = read("popup.html");

// act id -> a distinctive fragment of the help text that documents it. Matched against the raw
// HTML (not the rendered text) so a row cannot be "documented" by a passing mention in prose:
// the four stub buttons must each have their own key row, keyed on their `act-name` label.
const DOCUMENTED = {
  "confirm":       ['act-name">AI slop</span>'],
  "mark-slop":     ['on a post that was <em>shown</em>', "<b>missed</b> one"],
  "hide":          ['act-name">Hide post</span>'],
  "mute":          ['act-name">Mute</span>'],
  "allow":         ['act-name">Always show</span>'],
  "show":          ['act-name">Show anyway</span>'],
  "rehide":        ["<b>Hide again</b>"],
  "confirm-group": ["green <b>AI slop</b> splat"],
  "ungroup":       ["<b>Show all</b>"],
};

function actsInFeed() {
  const found = new Set();
  const re = /"data-fh-act",\s*"([a-z-]+)"/g;
  let m;
  while ((m = re.exec(feed))) found.add(m[1]);
  return [...found].sort();
}

test("every control the feed renders is listed in the help map", () => {
  const acts = actsInFeed();
  assert.ok(acts.length >= 9, `only found ${acts.length} controls — has the attribute been renamed?`);
  const undocumented = acts.filter((a) => !DOCUMENTED[a]);
  assert.deepStrictEqual(undocumented, [],
    `src/feed.ts renders these controls with no entry in this test's map: ${undocumented.join(", ")}. ` +
    `Document them in options.html and add the phrase here — a shipped control with no help entry ` +
    `is how FH-066 happened.`);
});

test("the map's entries are actually in options.html", () => {
  const missing = [];
  for (const [act, phrases] of Object.entries(DOCUMENTED)) {
    for (const p of phrases) if (!options.includes(p)) missing.push(`${act}: ${JSON.stringify(p)}`);
  }
  assert.deepStrictEqual(missing, [], `options.html no longer contains: ${missing.join(" | ")}`);
});

test("no stale claim that every control lives on a hidden post", () => {
  // The exact wording that was wrong for two releases. Kept as its own assertion because the
  // sentence reads perfectly well — nothing but a test notices it has stopped being true.
  assert.doesNotMatch(options, /icon buttons on each hidden.post stub\./,
    "the Post controls intro claims every control is on a hidden-post stub; the AI-slop mark is not");
});

test("both directions of the learning loop are described where the weights are shown", () => {
  // The panel that shows the learned weights explains what moves them. It named only the
  // hide-less direction, which is the misleading half on a model that also auto-tunes toward
  // hiding a target fraction.
  const panel = options.match(/How AI-slop detection works[\s\S]*?<h3/);
  assert.ok(panel, "options.html must have the 'How AI-slop detection works' panel");
  assert.match(panel[0], /Show anyway/, "the false-positive correction must be named");
  assert.match(panel[0], /missed/i, "the 'it missed one' correction must be named too");
});

test("the popup's help overlay says corrections go both ways", () => {
  const overlay = popup.match(/id="help-overlay"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(overlay, "popup.html must have the help overlay");
  assert.match(overlay[0], /Show anyway/, "the overlay must name Show anyway");
  assert.match(overlay[0], /missed one/i, "the overlay must name the shown-post correction");
});
