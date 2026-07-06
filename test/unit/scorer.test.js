"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { scorer, matcher } = require("../helper");

const CLEAN = "Fixed a caching bug this morning. It took about two hours. Tests pass now, shipping later today.";
const SLOP = [
  "Let’s be honest: this isn’t just a product launch — it’s a movement.",
  "The result? Clarity, momentum, and belief.",
  "Here’s what nobody tells you about building: it’s not about the code. It’s about the people.",
  "🚀 Ship fast.",
  "💡 Learn faster.",
  "🔥 Repeat."
].join("\n");

test("defaultWeights includes bias and every feature", () => {
  const w = scorer.defaultWeights();
  assert.strictEqual(typeof w.bias, "number");
  for (const id of scorer.FEATURE_IDS) assert.strictEqual(typeof w[id], "number", `weight for ${id}`);
});

test("clean human post scores below threshold; slop scores above", () => {
  assert.ok(scorer.classify(CLEAN).prob < scorer.THRESHOLD, "clean should pass");
  assert.ok(scorer.classify(SLOP).isSlop, "slop should be flagged");
});

test("individual tells fire on their signatures", () => {
  assert.ok(scorer.extractFeatures("a — b — c — d").emdash > 0);
  assert.ok(scorer.extractFeatures("It's not about winning, it's about growth.").antithesis > 0);
  assert.ok(scorer.extractFeatures("fast, cheap, and good").ruleofthree > 0);
  assert.ok(scorer.extractFeatures("The takeaway? Keep going.").rhetorical > 0);
  assert.ok(scorer.extractFeatures("Here's the thing: it matters.").openers > 0);
  assert.ok(scorer.extractFeatures("🚀🚀🚀🚀 growth").emoji > 0);
});

test("broetry tell fires on one-line-per-thought posts", () => {
  const broetry = "I failed.\nThen I learned.\nThen I won.\nBig lesson here.\nRemember this.";
  assert.ok(scorer.extractFeatures(broetry).broetry > 0);
  assert.strictEqual(scorer.extractFeatures("A normal flowing paragraph that keeps going on one line without breaks.").broetry, 0);
});

test("threshold option controls only the decision, not the probability", () => {
  const mild = "It's not about the destination, it's about the journey.";
  const strict = scorer.classify(mild, null, { threshold: 0.95 });
  const lax = scorer.classify(mild, null, { threshold: 0.2 });
  assert.strictEqual(strict.prob, lax.prob, "prob is threshold-independent");
  assert.strictEqual(strict.isSlop, strict.prob >= 0.95);
  assert.strictEqual(lax.isSlop, lax.prob >= 0.2);
  assert.ok(!strict.isSlop, "a very high threshold should pass borderline text");
});

test("empty / whitespace text yields all-zero features and low prob", () => {
  const f = scorer.extractFeatures("   ");
  for (const id of scorer.FEATURE_IDS) assert.strictEqual(f[id], 0);
  assert.ok(scorer.classify("").prob < scorer.THRESHOLD);
});

test("banlist feature weights confirmed hits above aggressive ones", () => {
  const ms = matcher.buildMatchers({
    entries: [
      { id: "c", category: "confirmed", matchType: "literal", match: ["delved into"] },
      { id: "a", category: "aggressive", aggressive: true, matchType: "literal", match: ["shape"] }
    ]
  });
  const confirmed = scorer.extractFeatures("we delved into the data", { matchers: ms, aggressive: true }).banlist;
  const aggr = scorer.extractFeatures("the shape of it", { matchers: ms, aggressive: true }).banlist;
  assert.ok(confirmed > aggr, "confirmed hit should carry more weight");
});

test("classify.detail names the top contributing tells", () => {
  const res = scorer.classify(SLOP);
  assert.ok(typeof res.detail === "string" && res.detail.length > 0);
});

test("learning: a false-positive correction lowers the score for that example", () => {
  let w = scorer.defaultWeights();
  const feats = scorer.extractFeatures(SLOP);
  const before = scorer.score(feats, w).prob;
  for (let i = 0; i < 8; i++) w = scorer.learn(w, feats, 0, 0.5);   // label 0 = "not slop"
  const after = scorer.score(feats, w).prob;
  assert.ok(after < before, `expected ${after} < ${before}`);
});

test("learning: confirming slop raises the score for that example", () => {
  let w = scorer.defaultWeights();
  const feats = scorer.extractFeatures(CLEAN);
  const before = scorer.score(feats, w).prob;
  for (let i = 0; i < 8; i++) w = scorer.learn(w, feats, 1, 0.5);   // label 1 = "is slop"
  const after = scorer.score(feats, w).prob;
  assert.ok(after > before, `expected ${after} > ${before}`);
});

test("learning: weights stay bounded under repeated updates", () => {
  let w = scorer.defaultWeights();
  const feats = scorer.extractFeatures(SLOP);
  for (let i = 0; i < 500; i++) w = scorer.learn(w, feats, 1, 1.0);
  for (const k of Object.keys(w)) assert.ok(Math.abs(w[k]) <= 8.0001, `${k} out of bounds: ${w[k]}`);
});

test("learn does not mutate the input weights object", () => {
  const w = scorer.defaultWeights();
  const snapshot = JSON.stringify(w);
  scorer.learn(w, scorer.extractFeatures(SLOP), 0, 0.5);
  assert.strictEqual(JSON.stringify(w), snapshot);
});
