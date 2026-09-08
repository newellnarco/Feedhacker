"use strict";
// FH-045 / FH-046: the model must be SELECTIVE — hide slop, keep human writing, and hide
// less when there is less slop to hide.
//
// Two faults made it hide most of a normal feed:
//   * `claudisms.json` is a house STYLE GUIDE ("em dashes banned outright", "leverage —
//     corporate-speak verb"), consumed as if it were evidence of AI authorship, on the
//     model's largest weight (3.2). The em dash was ALSO scored by the `emdash` structural
//     tell, so one character contributed ~2.9 of z against a bias of -1.6 — on its own
//     enough to hide "Congrats on the promotion — well deserved".
//   * autocalibrate clamped its quantile threshold to [0.4, 0.9]. Scores are bimodal, so
//     the quantile always landed inside a cluster and snapped to a clamp: targetFrac was a
//     QUOTA (a clean feed still lost its top ~28%) and the Sensitivity slider was inert.
const test = require("node:test");
const assert = require("node:assert");
const { scorer, matcher } = require("../helper");
const banlist = require("../../claudisms.json");

const matchers = matcher.buildMatchers({ entries: banlist.entries || [] });
const W = scorer.defaultWeights();
const p = (text) => scorer.classify(text, W, { matchers, threshold: 0.5 }).prob;

// --- FH-045: punctuation and ordinary words are not evidence of a machine ------------
test("one em dash does not turn a human sentence into slop", () => {
  const plain = "Congrats to Priya on the promotion - very well deserved. She has carried that project for a year.";
  const dashed = "Congrats to Priya on the promotion — very well deserved. She has carried that project for a year.";
  assert.ok(p(plain) < 0.5, "the hyphen version is obviously not slop");
  assert.ok(p(dashed) < 0.5, `one em dash must not flip it (got ${p(dashed).toFixed(3)})`);
  // It may nudge the score, but nowhere near the 0.168 -> 0.786 jump it used to cause.
  assert.ok(p(dashed) - p(plain) < 0.25, "and the nudge stays small");
});

test("the em dash is scored once, by the tell — not again by the banlist", () => {
  const f = scorer.extractFeatures("We shipped it early — the team did great work.", { matchers });
  assert.strictEqual(f.banlist, 0, "the banlist must not re-score a character the tell owns");
  assert.ok((f._hits || []).every((h) => h.id !== "em-dash"), "no em-dash hit is reported either");
});

test("a sustained em-dash rate still reads as the tell", () => {
  const many = "This — that — the other — and more — again — still going — yes.";
  const one = "This is a normal sentence — with a single dash in it, written by a person.";
  assert.ok(scorer.extractFeatures(many, { matchers }).emdash > scorer.extractFeatures(one, { matchers }).emdash,
    "density, not presence, is the signal");
});

test("everyday business vocabulary is weak evidence, not a verdict", () => {
  // Every one of these is a banlist entry, and all are ordinary human business writing.
  const ordinary = "We need to leverage the new tooling and unpack the lessons learned from last quarter.";
  assert.ok(p(ordinary) < 0.5, `common business words must not hide a post (got ${p(ordinary).toFixed(3)})`);
});

test("genuine AI slop is still caught", () => {
  const slop = "Let's be honest: this isn't just a job — it's a calling. The result? Growth, clarity, and momentum. " +
    "Here's what nobody tells you: it's not about titles. It's about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
  assert.ok(p(slop) >= 0.5, `slop must still score above threshold (got ${p(slop).toFixed(3)})`);
});

test("a long, distinctive tic outweighs a bare common word", () => {
  const bare = scorer.extractFeatures("We should unpack that.", { matchers }).banlist;
  const tic = scorer.extractFeatures("The question that keeps coming up is worth sitting with.", { matchers }).banlist;
  assert.ok(tic > bare, "a multi-word curated tic is stronger evidence than a single word");
});

// --- FH-046: targetFrac is a ceiling, and the slider moves the floor ------------------
// Varied on both sides. Identical texts score identically, and a threshold cannot split a
// tie group — so a fixture of N copies of one post measures that artifact, not the ceiling.
const HUMAN_POOL = [
  "Notes from yesterday's incident review are up on the wiki if anyone wants them.",
  "We cut p99 latency from 800ms to 210ms by fixing one N+1 query.",
  "Back from parental leave today. The inbox is a disaster but it is good to be back.",
  "Anyone using Postgres logical replication in production at scale? Curious how it went.",
  "Congrats to Priya on the promotion — very well deserved, she has carried that project.",
];
const SLOP_POOL = [
  "Unpopular opinion: your network is your net worth. Moreover, consistency compounds. Ultimately, it's not about working harder — it's about working smarter. 🔑 Read that again.",
  "Let's be honest: this isn't just a job — it's a calling. The result? Growth, clarity, and momentum. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.",
  "Here's the thing.\n\nMost people won't tell you this.\n\nSuccess isn't about talent.\n\nIt's about consistency.\n\nLet that sink in. 👇",
  "Plot twist: the best leaders aren't the loudest. Here's why:\n\n• They listen more\n• They ask better questions\n• They give credit away\n\nRead that again. 💯",
  "The truth is, your résumé doesn't matter. What matters? Relationships. Reputation. Results. That's not a hack — it's the whole game. 🙌",
];
function feedObs(nHuman, nSlop) {
  const out = [];
  for (let i = 0; i < nHuman; i++) out.push({ features: scorer.extractFeatures(HUMAN_POOL[i % HUMAN_POOL.length], { matchers }) });
  for (let i = 0; i < nSlop; i++) out.push({ features: scorer.extractFeatures(SLOP_POOL[i % SLOP_POOL.length], { matchers }) });
  return out;
}

test("a feed with no slop in it loses nothing", () => {
  const cal = scorer.autocalibrate(W, feedObs(40, 0), { targetFrac: 0.28, priorThreshold: 0.5 });
  assert.ok(cal.calibrated, "enough observations to calibrate");
  assert.strictEqual(cal.flaggedFrac, 0,
    `targetFrac is a ceiling, not a quota — a clean feed keeps all of it (flagged ${cal.flaggedFrac})`);
});

test("targetFrac caps how much can be hidden on a slop-heavy feed", () => {
  const cal = scorer.autocalibrate(W, feedObs(10, 30), { targetFrac: 0.28, priorThreshold: 0.5 });
  assert.ok(cal.calibrated);
  assert.ok(cal.flaggedFrac <= 0.45, `must not nuke the feed (flagged ${cal.flaggedFrac.toFixed(2)})`);
});

test("the Sensitivity slider moves the cutoff in the right direction", () => {
  // Monotonicity is the honest invariant. On a feed whose scores are PERFECTLY bimodal —
  // nothing between the ordinary cluster and the blatant one — no threshold can separate
  // the clusters differently, so the slider genuinely cannot change the outcome there and
  // this asserts non-strict ordering. What the fix removed is the quota (see the clean-feed
  // test above); what it enables is real movement whenever the feed has a spread of scores,
  // which the next test exercises.
  const obs = feedObs(30, 10);
  const t = (frac) => scorer.autocalibrate(W, obs, { targetFrac: frac, priorThreshold: 0.5 }).threshold;
  assert.ok(t(0.10) >= t(0.28), `strict must not hide more than balanced (${t(0.10)} vs ${t(0.28)})`);
  assert.ok(t(0.28) >= t(0.50), `balanced must not hide more than aggressive (${t(0.28)} vs ${t(0.50)})`);
});

test("on a feed with a spread of scores, the slider changes how much is hidden", () => {
  // A realistic mix: clearly-human, borderline, and blatant. Here the setting has room to bite.
  const borderline = "Three things I am watching this quarter: pricing, churn, and hiring velocity. " +
    "We should leverage what we learned and unpack the lessons from last time.";
  const obs = feedObs(24, 8).concat(
    Array.from({ length: 8 }, () => ({ features: scorer.extractFeatures(borderline, { matchers }) })));
  const flagged = (frac) => scorer.autocalibrate(W, obs, { targetFrac: frac, priorThreshold: 0.5 }).flaggedFrac;
  assert.ok(flagged(0.50) > flagged(0.10),
    `aggressive must hide more than strict (${flagged(0.50).toFixed(2)} vs ${flagged(0.10).toFixed(2)})`);
});
