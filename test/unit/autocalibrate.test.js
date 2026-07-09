"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { scorer } = require("../helper");

// Build an observation whose feature vector is all zeros except the given overrides.
function obs(over) {
  const f = {};
  scorer.FEATURE_IDS.forEach((id) => { f[id] = 0; });
  Object.assign(f, over || {});
  return { features: f };
}

test("below the minimum sample size it returns the prior unchanged", () => {
  const prior = scorer.defaultWeights();
  const r = scorer.autocalibrate(prior, [obs({ emdash: 1 })], { minObs: 30 });
  assert.strictEqual(r.calibrated, false);
  assert.deepStrictEqual(r.weights, prior);
});

test("a tell that fires on almost every post is damped; a rare one is not", () => {
  const prior = scorer.defaultWeights();
  const list = [];
  // 60 posts: em dash on ALL of them (ubiquitous → uninformative), 'openers' on just 3.
  for (let i = 0; i < 60; i++) list.push(obs({ emdash: 0.9, openers: i < 3 ? 0.9 : 0 }));
  const r = scorer.autocalibrate(prior, list, {});
  assert.ok(r.calibrated);
  assert.ok(r.weights.emdash < prior.emdash * 0.6, `ubiquitous em-dash weight damped (${r.weights.emdash.toFixed(2)} < ${(prior.emdash * 0.6).toFixed(2)})`);
  assert.strictEqual(r.weights.openers, prior.openers, "rare 'openers' weight untouched");
  assert.ok(r.freqs.emdash > 0.9 && r.freqs.openers < 0.1, "frequencies reported");
});

test("threshold from the distribution stops 'almost everything' being flagged", () => {
  const prior = scorer.defaultWeights();
  // A population with a spread of banlist signal — the default model flags ~half of it.
  const list = [];
  for (let i = 0; i < 100; i++) list.push(obs({ banlist: i / 100 }));

  // How many the shipped defaults would hide (threshold 0.5):
  let defaultFlagged = 0;
  for (const o of list) if (scorer.score(o.features, prior).prob >= 0.5) defaultFlagged++;

  const r = scorer.autocalibrate(prior, list, { targetFrac: 0.28 });
  assert.ok(r.calibrated);
  assert.ok(r.threshold >= 0.4, "threshold respects the safety floor");
  assert.ok(r.flaggedFrac < defaultFlagged / list.length, "auto-calibration hides fewer than the default did");
  assert.ok(r.flaggedFrac <= 0.35, `hides roughly the target fraction, not the majority (got ${(r.flaggedFrac * 100).toFixed(0)}%)`);
});

test("is deterministic", () => {
  const prior = scorer.defaultWeights();
  const list = [];
  for (let i = 0; i < 50; i++) list.push(obs({ banlist: (i % 10) / 10, emdash: 0.8 }));
  const a = scorer.autocalibrate(prior, list, {});
  const b = scorer.autocalibrate(prior, list, {});
  assert.deepStrictEqual(a, b);
});
