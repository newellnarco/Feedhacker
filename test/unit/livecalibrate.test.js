"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { scorer } = require("../helper");

function obs(over) {
  const f = {};
  scorer.FEATURE_IDS.forEach((id) => { f[id] = 0; });
  Object.assign(f, over || {});
  return { features: f };
}
function population(n) {
  const list = [];
  for (let i = 0; i < n; i++) list.push(obs({ banlist: i / n, emdash: 0.8 }));   // em-dash ubiquitous
  return list;
}
function dist(a, b) {
  let s = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((k) => { const d = (a[k] || 0) - (b[k] || 0); s += d * d; });
  return Math.sqrt(s);
}

test("evolve is an EMA: endpoints and midpoint", () => {
  const a = { bias: -1.6, banlist: 3.2 };
  const b = { bias: -1.0, banlist: 1.2 };
  const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} ≈ ${y}`);
  const k0 = scorer.evolve(a, b, 0);
  near(k0.bias, a.bias); near(k0.banlist, a.banlist);
  const k1 = scorer.evolve(a, b, 1);
  near(k1.bias, b.bias); near(k1.banlist, b.banlist);
  const mid = scorer.evolve(a, b, 0.5);
  near(mid.bias, -1.3); near(mid.banlist, 2.2);
});

test("below the sample minimum it keeps the current running model", () => {
  const current = scorer.defaultWeights();
  const r = scorer.liveCalibrate({ current, observations: [obs({ banlist: 1 })], defaults: scorer.defaultWeights() });
  assert.strictEqual(r.calibrated, false);
  assert.deepStrictEqual(r.weights, current);
});

test("it is 'living' — evolves from the current model toward the target, not a reset", () => {
  const list = population(80);
  const defaults = scorer.defaultWeights();
  // First calibration from defaults establishes a target the running model moves toward.
  const auto = scorer.autocalibrate(defaults, list, {});
  const r = scorer.liveCalibrate({ current: defaults, defaults, observations: list, alpha: 0.6 });
  assert.ok(r.calibrated);
  // The result sits BETWEEN the current (defaults) and the pure target — it moved, but didn't snap.
  const toTarget = dist(r.weights, auto.weights);
  const toCurrent = dist(r.weights, defaults);
  assert.ok(toTarget > 0 && toCurrent > 0, "strictly between current and target");
  assert.ok(dist(defaults, auto.weights) > toCurrent, "moved away from where it started");
});

test("repeated cycles converge toward the autonomous target (accumulating)", () => {
  const list = population(80);
  const defaults = scorer.defaultWeights();
  const auto = scorer.autocalibrate(defaults, list, {});
  let w = defaults;
  let prev = Infinity;
  for (let i = 0; i < 6; i++) {
    const r = scorer.liveCalibrate({ current: w, defaults, observations: list, alpha: 0.6 });
    w = r.weights;
    const d = dist(w, auto.weights);
    assert.ok(d <= prev + 1e-9, "each cycle gets no further from the target");
    prev = d;
  }
  assert.ok(prev < dist(defaults, auto.weights) * 0.2, "after several cycles it is close to the target");
});

test("user corrections nudge the result, but less than the autonomous signal", () => {
  const list = population(80);
  const defaults = scorer.defaultWeights();
  // Confirmed-slop labels (label 1) on strongly-sloppy vectors.
  const labels = [];
  for (let i = 0; i < 10; i++) labels.push({ features: obs({ banlist: 0.9, emdash: 0.9 }).features, label: 1 });

  const noLabels = scorer.liveCalibrate({ current: defaults, defaults, observations: list, alpha: 0.6 });
  const withLabels = scorer.liveCalibrate({ current: defaults, defaults, observations: list, labels, alpha: 0.6 });

  const labelEffect = dist(withLabels.weights, noLabels.weights);
  const autonomousEffect = dist(noLabels.weights, defaults);
  assert.ok(labelEffect > 0, "corrections DO change the outcome (some impact)");
  assert.ok(labelEffect < autonomousEffect, `corrections move it less than the autonomous learner (${labelEffect.toFixed(3)} < ${autonomousEffect.toFixed(3)})`);
});

// --- FH-070: the threshold must be a quantile of the model actually in use ---------------
// The maintainer's 2026-09-18 export, on 0.10.0: 299 of 300 judged posts hidden against a 28%
// target, and the calibrator's own record said flaggedFrac 0.849. The weights were healthy —
// every tell within ±0.19 of shipped — but `bias` had drifted -1.6 -> -0.571 off 59 label-1
// corrections against 1 label-0, because the bias gradient carries no feature multiplier.
//
// The bug was not the drift. It was that `liveCalibrate` derived the cutoff from
// `autocalibrate(defaults, …)` — a model anchored to the shipped prior — and then applied it to
// the blended weights it actually returns. On those same observations, threshold 0.57 flagged
// 24% under the autonomous weights and 85% under the live ones. A threshold means nothing apart
// from the model it is a quantile of.
// Built from the firing rates the maintainer's own calibration record measured on 2026-09-18.
// Two earlier attempts at this fixture were useless and worth recording: one scored too LOW to
// reproduce the bug at all, and one fired every tell on every post, so ubiquity damping crushed
// the lot and nothing was ever flagged. A real LinkedIn feed sits in between — `broetry` on 79%
// of posts, `bullets` 75%, `ruleofthree` 40%, `emoji` 24%, `banlist` 9%, with a genuinely clean
// tail — which is why a drifted intercept tips most of it over the line.
function feedLike(n) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const f = {};
    if (i % 100 < 79) f.broetry = 0.3 + ((i * 7) % 50) / 100;
    if (i % 100 < 75) f.bullets = 0.25 + ((i * 11) % 30) / 100;
    if (i % 100 < 40) f.ruleofthree = 0.3;
    if (i % 100 < 24) f.emoji = 0.5;
    if (i % 100 < 9) { f.antithesis = 0.6; f.banlist = 0.4; }
    list.push(obs(f));
  }
  return list;
}
const flaggedUnder = (w, thr, population) =>
  population.filter((o) => scorer.score(o.features, w).prob >= thr).length / population.length;

// One-sided label-1 corrections — the maintainer's shape (59 label-1 against 1 label-0, because
// the new mark-as-slop control makes "you missed one" easy and nothing was a false positive).
// These are ESSENTIAL to the test: with no labels the blended weights equal the autonomous ones,
// so the two candidate thresholds coincide and the test cannot tell the fix from the bug. That
// is not hypothetical — the first version of this file passed with the fix reverted (§73).
function oneSidedLabels(population) {
  const out = [];
  for (let i = 0; i < 24; i++) out.push({ features: population[i * 5].features, label: 1 });
  out.push({ features: population[1].features, label: 0 });
  return out;
}

test("the returned threshold is a quantile of the returned WEIGHTS, not of the autonomous ones", () => {
  const population = feedLike(120);
  // A drifted running model, exactly the shape of the maintainer's: tells near shipped, bias up.
  const drifted = Object.assign(scorer.defaultWeights(), { bias: -0.571 });
  const labels = oneSidedLabels(population);
  const auto = scorer.autocalibrate(scorer.defaultWeights(), population, { targetFrac: 0.28 });
  const r = scorer.liveCalibrate({
    current: drifted, currentThreshold: 0.57, defaults: scorer.defaultWeights(),
    observations: population, labels, targetFrac: 0.28, alpha: 1,   // alpha 1 = no EMA lag
  });
  // The heart of it: the autonomous cutoff, applied to the model actually in use, over-hides.
  const wouldHaveHidden = flaggedUnder(r.weights, auto.threshold, population);
  assert.ok(wouldHaveHidden > 0.28 + 0.05,
    `the old behaviour must be reproduced here or this test proves nothing: applying ` +
    `auto.threshold (${auto.threshold.toFixed(3)}) to the live weights hides ` +
    `${(wouldHaveHidden * 100).toFixed(1)}%`);
  assert.ok(r.threshold > auto.threshold + 1e-6,
    "the live cutoff must sit above the autonomous one, since the live intercept is higher");
  const live = flaggedUnder(r.weights, r.threshold, population);
  const drifted0 = flaggedUnder(drifted, 0.57, population);
  assert.ok(drifted0 > 0.6, `the fixture must actually reproduce over-hiding (got ${drifted0.toFixed(2)})`);
  // targetFrac is a CEILING, not a quota: the quantile caps how much CAN be hidden and the floor
  // decides whether anything deserves to be, so landing under the target is correct. What must
  // never happen is landing far ABOVE it, which is what applying another model's cutoff did.
  assert.ok(live <= 0.28 + 0.03,
    `the model in use must hide at most ~28%, not ${(live * 100).toFixed(1)}% — the threshold is ` +
    `being taken over a different model's scores (FH-070)`);
  assert.ok(Math.abs(r.flaggedFrac - live) < 1e-9,
    "the reported flaggedFrac must describe the same model the threshold came from");
});

test("a drifted model converges back to the target instead of hiding everything", () => {
  // The maintainer's recovery, in miniature: start where their export was and cycle.
  const population = feedLike(120);
  let w = Object.assign(scorer.defaultWeights(), { bias: -0.571 });
  let thr = 0.57;
  const before = flaggedUnder(w, thr, population);
  assert.ok(before > 0.6, `the poisoned starting point really does over-hide (${before.toFixed(2)})`);
  for (let i = 0; i < 8; i++) {
    const r = scorer.liveCalibrate({
      current: w, currentThreshold: thr, defaults: scorer.defaultWeights(),
      observations: population, labels: oneSidedLabels(population), targetFrac: 0.28, alpha: 0.6,
    });
    w = r.weights; thr = r.threshold;
  }
  const after = flaggedUnder(w, thr, population);
  assert.ok(after <= 0.28 + 0.03, `must settle at or under the 28% ceiling, got ${(after * 100).toFixed(1)}%`);
  assert.ok(after < before - 0.2, "and it must come DOWN from the over-hiding start");
  // The intercept is pulled back toward the prior even while one-sided corrections push it up —
  // this is the recovery path, so a model already in the maintainer's state needs no reset.
  assert.ok(w.bias < -0.571 - 0.2,
    `the drifted intercept should be pulled back down, got ${w.bias.toFixed(3)} from -0.571`);
});

test("the threshold floor still protects a clean feed", () => {
  // A population with nothing sloppy in it: the quantile would sit inside the human cluster, so
  // the floor is what stops FeedHacker hiding the top of it regardless (the FH-046 lesson).
  const clean = [];
  for (let i = 0; i < 60; i++) clean.push(obs({ emdash: (i % 3) / 30 }));
  const t = scorer.thresholdFor(scorer.defaultWeights(), clean, 0.28);
  assert.ok(t.threshold >= t.floor - 1e-9, "never below the floor");
  assert.strictEqual(flaggedUnder(scorer.defaultWeights(), t.threshold, clean), 0,
    "a clean feed loses nothing");
});

test("the threshold is never unhittable", () => {
  const allSlop = [];
  for (let i = 0; i < 60; i++) allSlop.push(obs({ banlist: 1, broetry: 1, emoji: 1, antithesis: 1 }));
  const t = scorer.thresholdFor(scorer.defaultWeights(), allSlop, 0.28);
  assert.ok(t.threshold <= 0.97 + 1e-9, `capped at 0.97, got ${t.threshold}`);
});

// --- FH-070, second half: corrections teach the TELLS more than the intercept -------------
test("a correction moves the tells more than it moves the bias", () => {
  // Before the damping, the opposite was true for any post whose tells fire below 1.0 — which
  // is every real post. `learn`'s bias step is `lr * err`; a tell's is `lr * err * value`.
  const feats = {};
  scorer.FEATURE_IDS.forEach((id) => { feats[id] = 0; });
  feats.broetry = 0.4;
  const w0 = scorer.defaultWeights();
  const w1 = scorer.learn(w0, feats, 1, 0.3);
  const dBias = Math.abs(w1.bias - w0.bias);
  const dTell = Math.abs(w1.broetry - w0.broetry);
  assert.ok(dTell > dBias,
    `a tell firing at 0.4 must outweigh the intercept, got tell ${dTell.toFixed(4)} vs bias ${dBias.toFixed(4)}`);
  assert.ok(Math.abs(dBias - 0.3 * (1 - scorer.score(feats, w0).prob) * scorer.BIAS_LR) < 1e-9,
    "the bias step is scaled by BIAS_LR exactly");
});

test("damping slows the intercept without freezing it", () => {
  const feats = {};
  scorer.FEATURE_IDS.forEach((id) => { feats[id] = 0; });
  feats.broetry = 0.2;
  let w = scorer.defaultWeights();
  const start = w.bias;
  for (let i = 0; i < 10; i++) w = scorer.learn(w, feats, 1, 0.3);
  assert.ok(w.bias > start, "ten positive corrections still raise it — this is damping, not a freeze");
  assert.ok(w.bias < start + 0.8,
    `but nowhere near the ~+2.4 an undamped run would give: got ${(w.bias - start).toFixed(3)}`);
});

test("the ridge pull toward the prior is NOT damped, so the intercept can come home", () => {
  // Damping the data half only. If the pull were damped too, a model whose bias had drifted
  // could never be reeled back by retrain — which is precisely the recovery path FH-070 needs.
  const prior = scorer.defaultWeights();
  const drifted = Object.assign({}, prior, { bias: 0.5 });
  const feats = {};
  scorer.FEATURE_IDS.forEach((id) => { feats[id] = 0; });
  feats.broetry = 0.5;
  // One label-0 example: the data half pushes down, the ridge pulls toward the prior's -1.6.
  const out = scorer.retrain(prior, [{ features: feats, label: 0 }], { lr: 0.3, epochs: 200, lambda: 0.15 });
  assert.ok(out.bias < drifted.bias, "retrain still moves the intercept toward the prior");
});

test("retrain damps the intercept too, not just the online step", () => {
  // The batch path is the one liveCalibrate actually uses, so damping only `learn` would leave
  // the real loop undamped. Mutation testing caught this gap: undamping retrain's bias gradient
  // failed nothing until this case existed.
  const population = feedLike(120);
  const labels = oneSidedLabels(population);          // 24 x label-1 against 1 x label-0
  const prior = scorer.defaultWeights();
  const out = scorer.retrain(prior, labels, { lr: 0.15, epochs: 40, lambda: 0.15 });
  const dBias = out.bias - prior.bias;
  const dTells = scorer.FEATURE_IDS.map((id) => Math.abs((out[id] || 0) - (prior[id] || 0)));
  const biggestTell = Math.max(...dTells);
  assert.ok(dBias > 0, "one-sided positive corrections do still raise it — damping, not a freeze");
  assert.ok(dBias < biggestTell,
    `24 label-1 examples must teach the tells more than the intercept: bias moved ` +
    `${dBias.toFixed(4)} vs the largest tell ${biggestTell.toFixed(4)}`);
});
