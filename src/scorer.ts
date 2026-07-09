// FeedHacker — AI-slop scoring engine. Pure and testable (no chrome.*, no DOM).
//
// Instead of hiding a post the moment a single banned word appears, this scores a
// post across a set of independent STRUCTURAL "tells" that AI-written LinkedIn
// prose leans on, combines them through learned weights (logistic regression), and
// flags only when the combined evidence crosses a threshold. The curated phrase
// banlist (claudisms.json) becomes just ONE weighted signal among many, which is
// what fixes the old "common word => instant false positive" problem.
//
// It also LEARNS: every user correction ("Show anyway" = false positive; "Hide
// again" after revealing = confirmed) nudges the weights via one online gradient
// step. Weights are persisted by the glue layer; the math here is deterministic.
(function (root) {
  "use strict";

  // --- helpers ---
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  function words(text) { return (text.match(/\b[\w'’]+\b/g) || []); }
  // Split into sentence-ish units for length-variance analysis.
  function sentences(text) {
    return text.split(/[.!?\n]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  // Emoji detection (broad ranges + variation selectors). Kept as one regex so the
  // "emoji density" tell and the banlist-independent emoji signal agree.
  var EMOJI_RE = /[←-⇿⌀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/gu;

  // --- structural tells ---
  // Each returns a value roughly in [0,1]. Density tells are normalized per-100-words
  // so long posts aren't penalized purely for length. Order defines FEATURES.
  var TELLS = [
    { id: "emdash", label: "em dashes", fn: function (t, w) {
        var n = (t.match(/—/g) || []).length;
        return clamp01(n / Math.max(1, w.length / 60));   // ~1 per 60 words reads as heavy
      } },
    // "not X, but Y" / "isn't just X — it's Y" / "It's not about X. It's about Y."
    { id: "antithesis", label: "not-X-but-Y framing", fn: function (t) {
        var re = /\b(?:it['’]?s|that['’]?s|this is(?:n['’]?t)?|is not|isn['’]?t|not just|wasn['’]?t)\b[^.?!]{0,60}?\b(?:but|it['’]?s|they['’]?re|rather|instead)\b/gi;
        var n = (t.match(re) || []).length;
        n += (t.match(/\bnot about\b[^.?!]{0,50}?\bit['’]?s about\b/gi) || []).length;
        return clamp01(n / 2);
      } },
    // Triadic listing cadence: "A, B, and C" and staccato "X. Y. Z." triples.
    { id: "ruleofthree", label: "rule-of-three cadence", fn: function (t) {
        var lists = (t.match(/\b[\w'’]+(?:\s+[\w'’]+){0,2}\s*,\s+[\w'’]+(?:\s+[\w'’]+){0,2}\s*,\s+(?:and|or)\s+[\w'’]+/gi) || []).length;
        var triads = (t.match(/(?:^|[.!?]\s)[A-Z][^.!?]{1,40}[.!?]\s[A-Z][^.!?]{1,40}[.!?]\s[A-Z][^.!?]{1,40}[.!?]/g) || []).length;
        return clamp01((lists + triads) / 3);
      } },
    // Rhetorical fragment then answer: "The result?" "The takeaway?" "The best part?"
    { id: "rhetorical", label: "rhetorical fragments", fn: function (t) {
        var n = (t.match(/(?:^|\n|[.!?]\s)\s*(?:the\s+)?(?:result|takeaway|kicker|catch|best part|hard part|truth|reality|bottom line|lesson|point|question)\s*\?/gi) || []).length;
        return clamp01(n / 2);
      } },
    { id: "emoji", label: "emoji density", fn: function (t, w) {
        var n = (t.match(EMOJI_RE) || []).length;
        return clamp01(n / Math.max(1, w.length / 25));
      } },
    // Emoji/dash/number bullet lines — the "listicle" body shape.
    { id: "bullets", label: "bullet-list shape", fn: function (t) {
        var lines = t.split(/\n/);
        var b = 0;
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i].trim();
          if (!ln) continue;
          if (/^(?:[-*•▪◦‣·]|\d+[.)]|[←-➿⬀-⯿️\u{1F000}-\u{1FAFF}])/u.test(ln)) b++;
        }
        return clamp01(b / 4);
      } },
    // Formal connective density — AI over-signposts.
    { id: "connectives", label: "formal connectives", fn: function (t, w) {
        var n = (t.match(/\b(?:moreover|furthermore|additionally|consequently|therefore|thus|hence|nevertheless|notably|importantly|ultimately|in essence|in conclusion)\b/gi) || []).length;
        return clamp01(n / Math.max(1, w.length / 120));
      } },
    // Hedging / curiosity-gap openers.
    { id: "openers", label: "formula openers", fn: function (t) {
        var n = (t.match(/(?:^|\n)\s*(?:let['’]?s be honest|here['’]?s the thing|here['’]?s (?:what|why|how)|the truth is|let that sink in|read that again|hot take|unpopular opinion|plot twist|here['’]?s what (?:nobody|no one) tells you)\b/gi) || []).length;
        return clamp01(n / 1);
      } },
    // "Broetry": one thought per line, lots of short standalone lines. A very
    // LinkedIn-specific slop shape. Needs several short lines AND a high ratio.
    { id: "broetry", label: "one-line-per-thought", fn: function (t) {
        var lines = t.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (lines.length < 3) return 0;
        var short = 0;
        for (var i = 0; i < lines.length; i++) {
          var w = (lines[i].match(/\b[\w'’]+\b/g) || []).length;
          if (w > 0 && w <= 12) short++;
        }
        var ratio = short / lines.length;
        return clamp01((ratio - 0.5) / 0.5) * clamp01(short / 4);
      } },
    // The airy "one short thought, blank line, one short thought" broetry rhythm. Unlike
    // the broetry tell (which strips blank lines), this measures the SPACING itself:
    // paragraphs separated by blank lines that are each a single short line. Very specific
    // to LinkedIn broetry; normal prose uses multi-sentence paragraphs, lists use bullets.
    { id: "spaced", label: "spaced one-liners", fn: function (t) {
        var blocks = t.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
        if (blocks.length < 4) return 0;
        var shortSingles = 0;
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (/\n/.test(b)) continue;                          // a lone one-liner, not a multi-line block
          var w = (b.match(/\b[\w'’]+\b/g) || []).length;
          if (w >= 2 && w <= 14) shortSingles++;
        }
        if (shortSingles < 4) return 0;                        // needs real volume of them
        var frac = shortSingles / blocks.length;               // ...and they must dominate the post
        // Ramp slowly from 4: a handful of airy lines (a quip, short verse) stays weak;
        // only a sustained wall of them (8+) saturates, which is the broetry tell.
        return clamp01((frac - 0.5) / 0.4) * clamp01((shortSingles - 3) / 6);
      } },
    // Sentence-length uniformity: AI prose has unusually even sentence lengths.
    // Only meaningful with >=4 sentences; returns 0 otherwise (not a penalty).
    { id: "uniformity", label: "uniform sentence length", fn: function (t) {
        var ss = sentences(t);
        if (ss.length < 4) return 0;
        var lens = ss.map(function (s) { return words(s).length; }).filter(function (n) { return n > 0; });
        if (lens.length < 4) return 0;
        var mean = lens.reduce(function (a, b) { return a + b; }, 0) / lens.length;
        if (mean < 4) return 0;   // very short fragments aren't the "even prose" tell
        var variance = lens.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / lens.length;
        var cv = Math.sqrt(variance) / mean;          // coefficient of variation
        return clamp01((0.5 - cv) / 0.5);             // low CV => high uniformity
      } }
  ];

  // Banlist tell is handled specially because it depends on the runtime matchers +
  // per-entry confidence (curated "confirmed" phrases count more than "aggressive"
  // common-word rules). Returned value is a saturating count of weighted hits.
  function banlistValue(matchers, text) {
    if (!matchers || !matchers.length || !root.FeedHackerMatcher) return { value: 0, hits: [] };
    var det = root.FeedHackerMatcher.findHitDetails(matchers, text);
    if (!det.length) return { value: 0, hits: [] };
    var weight = 0, seen: any = {}, hits: any[] = [];
    for (var i = 0; i < det.length; i++) {
      var d = det[i];
      if (seen[d.id]) continue;
      seen[d.id] = 1;
      // confirmed curated tics are strong; aggressive/common ones are weak evidence.
      var conf = d.category === "confirmed" ? 1 : d.category === "manual" ? 0.4 : 0.7;
      if (d.aggressive) conf *= 0.4;
      weight += conf;
      hits.push(d);
    }
    return { value: clamp01(weight / 2), hits: hits };   // ~2 confirmed hits => saturated
  }

  var FEATURE_IDS = ["banlist"].concat(TELLS.map(function (t) { return t.id; }));
  var FEATURE_LABELS = { banlist: "AI phrasing" };
  TELLS.forEach(function (t) { FEATURE_LABELS[t.id] = t.label; });

  // Default weights + bias. banlist leads (curated signal); structural tells add up.
  // The negative bias means an average post scores well below threshold; evidence
  // has to accumulate. These are the LEARNED parameters that feedback tunes.
  function defaultWeights() {
    return {
      bias: -1.6,
      banlist: 3.2,
      emdash: 1.3, antithesis: 1.6, ruleofthree: 1.1, rhetorical: 1.4,
      emoji: 1.0, bullets: 0.9, connectives: 1.0, openers: 1.5, broetry: 1.4, spaced: 1.3, uniformity: 0.8
    };
  }

  var THRESHOLD = 0.5;

  // Extract every feature value from text. opts: {matchers}.
  function extractFeatures(text, opts) {
    opts = opts || {};
    var out: any = {};
    if (!text || !text.trim()) {
      for (var f = 0; f < FEATURE_IDS.length; f++) out[FEATURE_IDS[f]] = 0;
      out._hits = [];
      return out;
    }
    var w = words(text);
    var bl = banlistValue(opts.matchers, text);
    out.banlist = bl.value;
    out._hits = bl.hits;
    for (var i = 0; i < TELLS.length; i++) {
      out[TELLS[i].id] = clamp01(TELLS[i].fn(text, w));
    }
    return out;
  }

  // Linear combination -> probability, plus per-feature contribution for the
  // "why was this flagged" explainer.
  function score(features, weights) {
    weights = weights || defaultWeights();
    var z = (typeof weights.bias === "number" ? weights.bias : -1.6);
    var contributions: any[] = [];
    for (var i = 0; i < FEATURE_IDS.length; i++) {
      var id = FEATURE_IDS[i];
      var v = features[id] || 0;
      var wt = typeof weights[id] === "number" ? weights[id] : 0;
      var c = v * wt;
      z += c;
      if (v > 0 && c > 0) contributions.push({ id: id, label: FEATURE_LABELS[id], value: v, weight: wt, contribution: c });
    }
    contributions.sort(function (a, b) { return b.contribution - a.contribution; });
    return { prob: sigmoid(z), z: z, contributions: contributions };
  }

  // High-level: is this text AI slop? Returns the decision plus a compact detail
  // string naming the top contributing tells (for the stub label).
  function classify(text, weights, opts) {
    var features = extractFeatures(text, opts);
    var s = score(features, weights);
    var threshold = (opts && typeof opts.threshold === "number") ? opts.threshold : THRESHOLD;
    var isSlop = s.prob >= threshold;
    var top = s.contributions.slice(0, 5).map(function (c) {
      if (c.id === "banlist") {
        var names = (features._hits || []).slice(0, 3).map(function (h) {
          return h.id === "emoji" ? (h.text + " emojis") : (h.id === "em-dash" || h.text === "—") ? "em dash" : '"' + h.text + '"';
        });
        return names.length ? names.join(", ") : "AI phrasing";
      }
      return c.label;
    });
    return { isSlop: isSlop, prob: s.prob, features: features, contributions: s.contributions, detail: top.join(", ") };
  }

  // Online logistic-regression update from one labeled example.
  // label: 1 = confirmed slop, 0 = false positive. Returns a NEW weights object.
  // Weights are clamped to keep a runaway feedback loop from producing extremes.
  function learn(weights, features, label, lr) {
    weights = weights || defaultWeights();
    lr = typeof lr === "number" ? lr : 0.3;
    var s = score(features, weights);
    var err = (label ? 1 : 0) - s.prob;
    var next: any = {};
    for (var k in weights) if (Object.prototype.hasOwnProperty.call(weights, k)) next[k] = weights[k];
    next.bias = clampW((typeof next.bias === "number" ? next.bias : -1.6) + lr * err);
    for (var i = 0; i < FEATURE_IDS.length; i++) {
      var id = FEATURE_IDS[i];
      var v = features[id] || 0;
      var base = typeof next[id] === "number" ? next[id] : 0;
      next[id] = clampW(base + lr * err * v);
    }
    return next;
  }
  function clampW(x) { return x < -8 ? -8 : x > 8 ? 8 : x; }

  // Batch retrain from a set of labeled corrections — the "local recalibration" loop.
  // Unlike learn() (one online step), this fits ALL accumulated examples together, which is
  // far more stable, and it regularizes TOWARD a prior (the current defaults) so a small or
  // one-sided buffer — e.g. "almost everything was a false positive" — pulls the model down
  // without collapsing it to "never slop". examples: [{ features, label }]. Returns new
  // weights (never mutates prior). Deterministic: fixed epochs, full-batch gradient.
  function retrain(prior, examples, opts) {
    prior = prior || defaultWeights();
    opts = opts || {};
    var epochs = typeof opts.epochs === "number" ? opts.epochs : 300;
    var lr = typeof opts.lr === "number" ? opts.lr : 0.3;
    var lambda = typeof opts.lambda === "number" ? opts.lambda : 0.04;   // pull toward prior
    if (!examples || !examples.length) return prior;
    var keys = ["bias"].concat(FEATURE_IDS);
    var w: any = {};
    for (var k in prior) if (Object.prototype.hasOwnProperty.call(prior, k)) w[k] = prior[k];
    for (var ki = 0; ki < keys.length; ki++) if (typeof w[keys[ki]] !== "number") w[keys[ki]] = 0;
    var n = examples.length;
    for (var ep = 0; ep < epochs; ep++) {
      var grad: any = {};
      for (var g = 0; g < keys.length; g++) grad[keys[g]] = 0;
      for (var i = 0; i < n; i++) {
        var f = examples[i].features || {};
        var err = (examples[i].label ? 1 : 0) - score(f, w).prob;   // logistic gradient direction
        grad.bias += err;
        for (var j = 0; j < FEATURE_IDS.length; j++) {
          var id = FEATURE_IDS[j];
          grad[id] += err * (f[id] || 0);
        }
      }
      for (var m = 0; m < keys.length; m++) {
        var key = keys[m];
        // mean log-likelihood gradient + a pull back toward the prior weight (ridge to prior)
        var step = grad[key] / n - lambda * (w[key] - (typeof prior[key] === "number" ? prior[key] : 0));
        w[key] = clampW(w[key] + lr * step);
      }
    }
    return w;
  }

  // Autonomous, UNSUPERVISED calibration from the population of posts FeedHacker has actually
  // reviewed — no user labels required. Two moves, both recomputed FRESH from the shipped prior
  // each run so they can never drift:
  //   1) Ubiquity damping — a structural "tell" that fires on most posts in THIS feed carries
  //      little information, so its weight is shrunk toward zero. This is what stops one common
  //      signal (an em dash, an emoji) from flagging everything.
  //   2) Threshold from the score distribution — put the cutoff at the (1 - targetFrac) quantile
  //      of the population's own scores, so only the sloppiest ~targetFrac is hidden however the
  //      absolute numbers land. This is what fixes "almost everything gets flagged".
  // observations: [{ features }] (numeric feature vectors of scanned posts, slop or not).
  // Returns { weights, threshold, calibrated, flaggedFrac, freqs }.
  function autocalibrate(prior, observations, opts) {
    prior = prior || defaultWeights();
    opts = opts || {};
    var minObs = typeof opts.minObs === "number" ? opts.minObs : 30;
    var target = typeof opts.targetFrac === "number" ? opts.targetFrac : 0.28;
    target = target < 0.05 ? 0.05 : target > 0.6 ? 0.6 : target;
    var priorThr = typeof opts.priorThreshold === "number" ? opts.priorThreshold : THRESHOLD;
    var n = observations ? observations.length : 0;
    if (n < minObs) return { weights: prior, threshold: priorThr, calibrated: false, flaggedFrac: 0, freqs: {} };

    var EPS = 0.15, F0 = 0.45, DMIN = 0.25;   // active-threshold, damp-onset frequency, floor factor
    var weights: any = {};
    for (var k in prior) if (Object.prototype.hasOwnProperty.call(prior, k)) weights[k] = prior[k];
    var freqs: any = {};
    for (var fi = 0; fi < FEATURE_IDS.length; fi++) {
      var id = FEATURE_IDS[fi];
      var active = 0;
      for (var i = 0; i < n; i++) { if (((observations[i].features || {})[id] || 0) >= EPS) active++; }
      var freq = active / n;
      freqs[id] = freq;
      var factor = 1;
      if (freq > F0) factor = 1 - ((freq - F0) / (1 - F0)) * (1 - DMIN);
      if (factor < DMIN) factor = DMIN;
      var base = typeof prior[id] === "number" ? prior[id] : 0;
      weights[id] = base > 0 ? base * factor : base;   // only damp positive (slop-ward) weights
    }
    var probs: number[] = [];
    for (var j = 0; j < n; j++) probs.push(score(observations[j].features || {}, weights).prob);
    probs.sort(function (a, b) { return a - b; });
    var idx = Math.floor((1 - target) * (n - 1));
    var thr = probs[idx];
    if (thr < 0.4) thr = 0.4; else if (thr > 0.9) thr = 0.9;   // safety clamp: never near-random, never unhittable
    var flagged = 0;
    for (var m = 0; m < n; m++) if (probs[m] >= thr) flagged++;
    return { weights: weights, threshold: thr, calibrated: true, flaggedFrac: flagged / n, freqs: freqs };
  }

  // Exponential-moving-average blend: move `current` a fraction `alpha` toward `target`.
  // alpha=0 keeps current, alpha=1 jumps to target. This is what makes calibration "living" —
  // the running model evolves smoothly toward each new target and accumulates across sessions,
  // instead of resetting to a fixed model each time.
  function evolve(current, target, alpha) {
    if (!current) return target;
    if (!target) return current;
    var a = typeof alpha === "number" ? (alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) : 0.5;
    var keys: any = {}, out: any = {};
    for (var k in current) if (Object.prototype.hasOwnProperty.call(current, k)) keys[k] = 1;
    for (var k2 in target) if (Object.prototype.hasOwnProperty.call(target, k2)) keys[k2] = 1;
    for (var key in keys) {
      var c = typeof current[key] === "number" ? current[key] : 0;
      var t = typeof target[key] === "number" ? target[key] : 0;
      out[key] = c + a * (t - c);
    }
    return out;
  }

  // The "living learner": one calibration step that combines everything.
  //   1) autonomous target from the population (ubiquity damping + distribution threshold),
  //   2) a GENTLE nudge from the user's labeled corrections (small lr/epochs, strong pull back
  //      to the autonomous target — so selections matter, but less than the autonomous signal),
  //   3) an EMA from the CURRENT running model toward that target, so the model keeps evolving
  //      from its latest state rather than snapping back to the shipped defaults.
  // opts: { current, currentThreshold, defaults, observations, labels, targetFrac, alpha }.
  function liveCalibrate(opts) {
    opts = opts || {};
    var defaults = opts.defaults || defaultWeights();
    var obs = opts.observations || [];
    var auto = autocalibrate(defaults, obs, { targetFrac: opts.targetFrac, priorThreshold: opts.currentThreshold });
    if (!auto.calibrated) {
      return {
        calibrated: false,
        weights: opts.current || defaults,
        threshold: typeof opts.currentThreshold === "number" ? opts.currentThreshold : THRESHOLD,
        flaggedFrac: 0, freqs: auto.freqs, labelsUsed: 0
      };
    }
    var labels = opts.labels || [];
    // User corrections nudge the autonomous weights but are pulled firmly back to them.
    var target = labels.length >= 3 ? retrain(auto.weights, labels, { lr: 0.15, epochs: 40, lambda: 0.15 }) : auto.weights;
    var alpha = typeof opts.alpha === "number" ? opts.alpha : 0.6;
    var weights = opts.current ? evolve(opts.current, target, alpha) : target;
    var curThr = typeof opts.currentThreshold === "number" ? opts.currentThreshold : auto.threshold;
    var threshold = opts.current ? (curThr + alpha * (auto.threshold - curThr)) : auto.threshold;
    var flagged = 0;
    for (var i = 0; i < obs.length; i++) if (score(obs[i].features || {}, weights).prob >= threshold) flagged++;
    return {
      calibrated: true, weights: weights, threshold: threshold,
      flaggedFrac: obs.length ? flagged / obs.length : 0, freqs: auto.freqs, labelsUsed: labels.length
    };
  }

  var api = {
    TELLS: TELLS, FEATURE_IDS: FEATURE_IDS, FEATURE_LABELS: FEATURE_LABELS, THRESHOLD: THRESHOLD,
    EMOJI_RE: EMOJI_RE, words: words, sentences: sentences,
    defaultWeights: defaultWeights, extractFeatures: extractFeatures,
    score: score, classify: classify, learn: learn, retrain: retrain,
    autocalibrate: autocalibrate, evolve: evolve, liveCalibrate: liveCalibrate
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerScorer = api;
})(typeof self !== "undefined" ? self : this);
