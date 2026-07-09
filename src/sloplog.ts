// FeedHacker — AI-slop decision log. Pure, testable helpers for a capped ring buffer of
// "why did we flag this?" records: the probability, the ranked structural tells that fired
// (with their weight + contribution), the matched banlist phrases, the author, and a short
// preview — plus the user's later verdict (0 = false positive via "Show anyway", 1 =
// confirmed). The glue layer (content.js) persists the buffer to chrome.storage.local under
// STORAGE_KEY; the options page renders a summary, exports it as JSON, and can retrain from
// the labeled subset. No chrome.*, no DOM — so it unit-tests cleanly.
(function (root) {
  "use strict";

  var STORAGE_KEY = "feedhacker:sloplog";
  var MAX = 300;                 // keep the last N decisions; oldest drop off
  var PREVIEW_MAX = 280;         // privacy: store only a short opening slice of the post

  function round(x, dp?) {
    var p = Math.pow(10, typeof dp === "number" ? dp : 3);
    return Math.round((Number(x) || 0) * p) / p;
  }
  function clip(s, max?) {
    s = s == null ? "" : String(s);
    max = typeof max === "number" ? max : PREVIEW_MAX;
    return s.length > max ? s.slice(0, max) + "…" : s;
  }

  // Build one decision entry. `d` carries the raw decision detail from the scorer; nowMs is
  // injected (Date.now() in the app) so this stays pure. `top` is the ranked contributions
  // ([{id,label,value,weight,contribution}]); `phrases` are matched banlist strings.
  function makeEntry(d, nowMs) {
    d = d || {};
    var ts = typeof nowMs === "number" ? nowMs : 0;
    var top = (d.top || []).slice(0, 8).map(function (c) {
      return { id: c.id, label: c.label, value: round(c.value), weight: round(c.weight), contribution: round(c.contribution) };
    });
    var phrases = (d.phrases || []).slice(0, 12).map(function (p) { return clip(p, 60); });
    return {
      id: String(d.id || (ts.toString(36) + Math.round((d.prob || 0) * 1000))),
      ts: ts,
      iso: ts ? new Date(ts).toISOString() : "",
      surface: d.surface === "comment" ? "comment" : "post",
      prob: round(d.prob),
      threshold: round(typeof d.threshold === "number" ? d.threshold : 0.5),
      author: clip(d.author, 120),
      preview: clip(d.preview, PREVIEW_MAX),
      top: top,
      phrases: phrases,
      label: (d.label === 0 || d.label === 1) ? d.label : null,   // null = no verdict yet
      verdictAt: d.verdictAt || 0
    };
  }

  // Append with cap. Returns a NEW array (does not mutate input).
  function push(list, entry, max) {
    var cap = typeof max === "number" ? max : MAX;
    var out = (list || []).concat([entry]);
    if (out.length > cap) out = out.slice(out.length - cap);
    return out;
  }

  // Stamp a user verdict onto the most recent matching entry. label: 0 (false positive) or
  // 1 (confirmed). Returns a NEW array; unchanged if no entry with that id exists.
  function applyVerdict(list, id, label, nowMs) {
    if (!list || !id) return list || [];
    var lab = label ? 1 : 0;
    var out = list.slice();
    for (var i = out.length - 1; i >= 0; i--) {   // most recent first
      if (out[i] && out[i].id === id) {
        var e: any = {}; for (var k in out[i]) if (Object.prototype.hasOwnProperty.call(out[i], k)) e[k] = out[i][k];
        e.label = lab; e.verdictAt = typeof nowMs === "number" ? nowMs : 0;
        out[i] = e;
        return out;
      }
    }
    return out;
  }

  // Counts for the options panel.
  function summarize(list) {
    var total = 0, falsePositives = 0, confirmed = 0, unlabeled = 0;
    for (var i = 0; i < (list || []).length; i++) {
      var e = list[i]; if (!e) continue;
      total++;
      if (e.label === 0) falsePositives++;
      else if (e.label === 1) confirmed++;
      else unlabeled++;
    }
    return { total: total, falsePositives: falsePositives, confirmed: confirmed, unlabeled: unlabeled };
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY, MAX: MAX, PREVIEW_MAX: PREVIEW_MAX,
    makeEntry: makeEntry, push: push, applyVerdict: applyVerdict, summarize: summarize
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerSlopLog = api;
})(typeof self !== "undefined" ? self : this);
