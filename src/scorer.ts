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
  function banlistValue(matchers, text, aggressive) {
    if (!matchers || !matchers.length || !root.FeedHackerMatcher) return { value: 0, hits: [] };
    var det = root.FeedHackerMatcher.findHitDetails(matchers, text, !!aggressive);
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
      emoji: 1.0, bullets: 0.9, connectives: 1.0, openers: 1.5, broetry: 1.4, uniformity: 0.8
    };
  }

  var THRESHOLD = 0.5;

  // Extract every feature value from text. opts: {matchers, aggressive}.
  function extractFeatures(text, opts) {
    opts = opts || {};
    var out: any = {};
    if (!text || !text.trim()) {
      for (var f = 0; f < FEATURE_IDS.length; f++) out[FEATURE_IDS[f]] = 0;
      out._hits = [];
      return out;
    }
    var w = words(text);
    var bl = banlistValue(opts.matchers, text, opts.aggressive);
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

  var api = {
    TELLS: TELLS, FEATURE_IDS: FEATURE_IDS, FEATURE_LABELS: FEATURE_LABELS, THRESHOLD: THRESHOLD,
    EMOJI_RE: EMOJI_RE, words: words, sentences: sentences,
    defaultWeights: defaultWeights, extractFeatures: extractFeatures,
    score: score, classify: classify, learn: learn
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerScorer = api;
})(typeof self !== "undefined" ? self : this);
