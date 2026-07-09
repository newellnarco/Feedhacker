"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { scorer } = require("../helper");

// A structurally slop-ish post (em dashes, antithesis, rule-of-three, emojis, opener).
const SLOP =
  "Let's be honest: this isn't just a job — it's a calling. The result? Growth, clarity, and momentum. " +
  "Here's what nobody tells you: it's not about titles. It's about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";

test("retrain with no examples returns the prior unchanged", () => {
  const prior = scorer.defaultWeights();
  const out = scorer.retrain(prior, [], {});
  assert.deepStrictEqual(out, prior);
});

test("false-positive corrections lower the score for that kind of post", () => {
  const feats = scorer.extractFeatures(SLOP, {});
  const p0 = scorer.score(feats, scorer.defaultWeights()).prob;

  // The user marked eight posts like this as "not slop" (Show anyway).
  const examples = Array.from({ length: 8 }, () => ({ features: feats, label: 0 }));
  const w = scorer.retrain(scorer.defaultWeights(), examples, {});
  const p1 = scorer.score(feats, w).prob;

  assert.ok(p1 < p0, `retrained score ${p1.toFixed(3)} should be below default ${p0.toFixed(3)}`);
});

test("regularization toward the prior keeps a one-sided batch from collapsing the model", () => {
  const feats = scorer.extractFeatures(SLOP, {});
  const examples = Array.from({ length: 8 }, () => ({ features: feats, label: 0 }));
  const w = scorer.retrain(scorer.defaultWeights(), examples, {});
  // bias eases down (fewer flags) but stays well inside the clamp — not a runaway to -8.
  assert.ok(w.bias < scorer.defaultWeights().bias, "bias decreased");
  assert.ok(w.bias > -8, "bias stayed inside the clamp (did not collapse)");
});

test("a mix of confirmed + false-positive examples still separates them", () => {
  const strong = scorer.extractFeatures(SLOP, {});
  const plain = scorer.extractFeatures("Fixed a caching bug this morning. Tests pass. Shipping the patch after lunch.", {});
  const examples = [];
  for (let i = 0; i < 6; i++) examples.push({ features: strong, label: 1 });   // confirmed slop
  for (let i = 0; i < 6; i++) examples.push({ features: plain, label: 0 });    // not slop
  const w = scorer.retrain(scorer.defaultWeights(), examples, {});
  const pStrong = scorer.score(strong, w).prob;
  const pPlain = scorer.score(plain, w).prob;
  assert.ok(pStrong > pPlain, "confirmed-slop post still scores above the plain post");
});
