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
