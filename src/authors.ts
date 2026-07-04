// FeedHacker — per-author memory. Pure, testable store helpers (no chrome.*).
// Tracks a stable key per author, how often you hide vs. keep their posts, and two
// explicit lists: muted (always hide) and allowed (always show). The glue layer
// persists the store to chrome.storage.local; all logic here is deterministic.
(function (root) {
  "use strict";

  function ensure(store) {
    store = store || {};
    if (!store.muted) store.muted = {};
    if (!store.allowed) store.allowed = {};
    if (!store.scores) store.scores = {};   // key -> { hidden, shown, name }
    return store;
  }

  // Stable key from {name, url}. Prefer the profile/company path (survives display
  // name changes); fall back to a normalized name.
  function keyFor(info) {
    if (info && info.url) {
      var m = String(info.url).match(/linkedin\.com(\/(?:in|company|school)\/[^/?#]+)/i);
      if (m) return m[1].toLowerCase();
      var p = String(info.url).match(/\/(?:in|company|school)\/[^/?#]+/i);
      if (p) return p[0].toLowerCase();
    }
    var name = (info && info.name || "").replace(/\s+/g, " ").trim().toLowerCase();
    return name ? "name:" + name : "";
  }

  function isMuted(store, key) { return !!(key && ensure(store).muted[key]); }
  function isAllowed(store, key) { return !!(key && ensure(store).allowed[key]); }

  function clone(store) { return JSON.parse(JSON.stringify(ensure(store))); }

  // Muting clears an allow (and vice-versa) — they're mutually exclusive.
  function mute(store, key, name) {
    var s = clone(store); if (!key) return s;
    s.muted[key] = 1; delete s.allowed[key];
    if (name) { s.scores[key] = s.scores[key] || { hidden: 0, shown: 0 }; s.scores[key].name = name; }
    return s;
  }
  function unmute(store, key) { var s = clone(store); delete s.muted[key]; return s; }
  function allow(store, key, name) {
    var s = clone(store); if (!key) return s;
    s.allowed[key] = 1; delete s.muted[key];
    if (name) { s.scores[key] = s.scores[key] || { hidden: 0, shown: 0 }; s.scores[key].name = name; }
    return s;
  }
  function unallow(store, key) { var s = clone(store); delete s.allowed[key]; return s; }

  // Record an outcome: hidden=true when a post was filtered, false when kept/revealed.
  function record(store, key, name, hidden) {
    var s = clone(store); if (!key) return s;
    var sc = s.scores[key] || { hidden: 0, shown: 0 };
    if (hidden) sc.hidden = (sc.hidden || 0) + 1; else sc.shown = (sc.shown || 0) + 1;
    if (name) sc.name = name;
    s.scores[key] = sc;
    return s;
  }

  function score(store, key) {
    var sc = ensure(store).scores[key] || { hidden: 0, shown: 0 };
    var total = (sc.hidden || 0) + (sc.shown || 0);
    return { hidden: sc.hidden || 0, shown: sc.shown || 0, name: sc.name || "", ratio: total ? sc.hidden / total : 0 };
  }

  // Authors who look like chronic slop: enough hidden posts and a high hide ratio.
  // Used to *suggest* muting (never auto-mutes unless the caller opts in).
  function chronic(store, key, minHidden, minRatio) {
    minHidden = minHidden || 3; minRatio = minRatio || 0.8;
    var sc = score(store, key);
    return sc.hidden >= minHidden && sc.ratio >= minRatio;
  }

  // Sorted list for the options "top sources" view.
  function topSources(store, n) {
    var s = ensure(store), out: any[] = [];
    for (var k in s.scores) if (Object.prototype.hasOwnProperty.call(s.scores, k)) {
      var sc = s.scores[k];
      out.push({ key: k, name: sc.name || k, hidden: sc.hidden || 0, shown: sc.shown || 0 });
    }
    out.sort(function (a, b) { return b.hidden - a.hidden; });
    return typeof n === "number" ? out.slice(0, n) : out;
  }

  function listMuted(store) { return Object.keys(ensure(store).muted); }
  function listAllowed(store) { return Object.keys(ensure(store).allowed); }

  var api = {
    ensure: ensure, keyFor: keyFor, isMuted: isMuted, isAllowed: isAllowed,
    mute: mute, unmute: unmute, allow: allow, unallow: unallow,
    record: record, score: score, chronic: chronic, topSources: topSources,
    listMuted: listMuted, listAllowed: listAllowed
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerAuthors = api;
})(typeof self !== "undefined" ? self : this);
