// FeedHacker for LinkedIn — glue layer.
// Wires the pure matcher (matcher.js), scorer (scorer.js), and DOM layer (feed.js)
// to chrome storage, the banlist fetch, a toolbar badge, the learned slop weights,
// error logging, and a debounced/idle MutationObserver for scroll.
(function () {
  "use strict";

  var Filters = self.FeedHackerFilters;
  var Log = self.FeedHackerLog;
  var Scorer = self.FeedHackerScorer;
  var Authors = self.FeedHackerAuthors;
  var Custom = self.FeedHackerCustom;
  var SEL = self.FeedHackerSelectors;
  var DEFAULTS = Filters.DEFAULTS;
  var WEIGHTS_KEY = "feedhacker:slopWeights";
  var STATS_KEY = "feedhacker:stats";
  var CUSTOM_KEY = "feedhacker:custom";
  var AUTHORS_KEY = "feedhacker:authors";
  var HISTORY_KEY = "feedhacker:history";
  var authorStore = {};

  var settings = Object.assign({}, DEFAULTS);
  var matchers: any[] = [];
  var ready = false;
  var F = self.FeedHackerFeed;

  // --- error logging -------------------------------------------------------
  // Append a timestamped entry to storage.local and tell the service worker to
  // flip the badge to an error state. Everything here is defensive: logging must
  // never itself throw and take the extension down.
  function logError(err, context) {
    try {
      console.error("FeedHacker [" + (context || "?") + "]", err);
      if (!Log || !chrome.storage || !chrome.storage.local) return;
      var entry = Log.makeEntry(err, context, Date.now());
      chrome.storage.local.get([Log.STORAGE_KEY], function (o) {
        try {
          var list = (o && o[Log.STORAGE_KEY]) || [];
          var next = Log.push(list, entry);
          var patch = {}; patch[Log.STORAGE_KEY] = next;
          chrome.storage.local.set(patch);
        } catch (e) {}
      });
      try { chrome.runtime.sendMessage({ type: "feedhacker:error", entry: entry }); } catch (e) {}
    } catch (e) { /* give up quietly */ }
  }
  // Catch uncaught errors thrown from OUR content scripts (filename carries our
  // extension id in the isolated world); ignore LinkedIn's own page errors.
  try {
    var myId = chrome.runtime && chrome.runtime.id;
    self.addEventListener("error", function (e) {
      if (myId && e && e.filename && e.filename.indexOf(myId) !== -1) logError(e.error || e.message, "uncaught");
    });
    self.addEventListener("unhandledrejection", function (e) {
      var r = e && e.reason;
      if (r && (String(r.stack || "").indexOf(myId) !== -1)) logError(r, "promise");
    });
  } catch (e) {}

  // --- learned slop weights ------------------------------------------------
  var weightsDirty = false, weightsSaveTimer: any = null;
  function saveWeightsSoon() {
    if (weightsSaveTimer) return;
    weightsSaveTimer = setTimeout(function () {
      weightsSaveTimer = null;
      if (!weightsDirty) return;
      weightsDirty = false;
      try {
        var patch = {}; patch[WEIGHTS_KEY] = settings.slopWeights;
        chrome.storage.local.set(patch);
      } catch (e) { logError(e, "save-weights"); }
    }, 1200);
  }
  // Called by feed.js when the user corrects a slop decision. One online gradient
  // step nudges the weights; future posts use the updated model immediately. lr is
  // smaller for implicit signals (scrolled-past) than explicit clicks.
  function onFeedback(features, label, lr) {
    try {
      if (!Scorer) return;
      settings.slopWeights = Scorer.learn(settings.slopWeights, features, label, typeof lr === "number" ? lr : 0.3);
      weightsDirty = true;
      saveWeightsSoon();
    } catch (e) { logError(e, "learn"); }
  }
  settings.onFeedback = onFeedback;

  // --- per-author memory -------------------------------------------------
  var authorsDirty = false, authorsTimer: any = null;
  function saveAuthorsSoon() {
    if (authorsTimer) return;
    authorsTimer = setTimeout(function () {
      authorsTimer = null;
      if (!authorsDirty) return;
      authorsDirty = false;
      try { var p = {}; p[AUTHORS_KEY] = authorStore; chrome.storage.local.set(p); }
      catch (e) { logError(e, "save-authors"); }
    }, 1500);
  }
  function refreshAuthorFlags() {
    settings.authors = authorStore;
    settings.authorMutesActive = !!(Authors && Authors.listMuted(authorStore).length);
  }
  function onMuteAuthor(info) {
    try {
      if (!Authors) return;
      authorStore = Authors.mute(authorStore, Authors.keyFor(info), info && info.name);
      refreshAuthorFlags();
      authorsDirty = true; saveAuthorsSoon();
      if (ready) { F.reset(document); scanNow(); reportBadge(); }   // apply immediately
    } catch (e) { logError(e, "mute-author"); }
  }
  settings.onMuteAuthor = onMuteAuthor;
  function onAuthorOutcome(info, hidden) {
    try {
      if (!Authors) return;
      var key = Authors.keyFor(info);
      if (!key) return;
      authorStore = Authors.record(authorStore, key, info && info.name, hidden);
      authorsDirty = true; saveAuthorsSoon();
    } catch (e) { /* stats best-effort */ }
  }
  settings.onAuthorOutcome = onAuthorOutcome;

  // --- history (daily hidden counts) -------------------------------------
  var histPending: any = null, histTimer: any = null;
  function todayKey() { try { return new Date().toISOString().slice(0, 10); } catch (e) { return "?"; } }
  function onHidden(flags) {
    try {
      var id = (flags && flags[0] && flags[0].id) || "other";
      if (!histPending) histPending = {};
      histPending[id] = (histPending[id] || 0) + 1;
      if (histTimer) return;
      histTimer = setTimeout(flushHistory, 4000);
    } catch (e) {}
  }
  settings.onHidden = onHidden;
  function flushHistory() {
    histTimer = null;
    var pend = histPending; histPending = null;
    if (!pend) return;
    var day = todayKey();
    chrome.storage.local.get([HISTORY_KEY], function (o) {
      try {
        var h = (o && o[HISTORY_KEY]) || {};
        var d = h[day] || { total: 0, byId: {} };
        for (var id in pend) if (Object.prototype.hasOwnProperty.call(pend, id)) {
          d.byId[id] = (d.byId[id] || 0) + pend[id];
          d.total += pend[id];
        }
        h[day] = d;
        var days = Object.keys(h).sort();
        while (days.length > 30) { var old = days.shift(); if (old) delete h[old]; }   // keep ~30 days
        var patch = {}; patch[HISTORY_KEY] = h; chrome.storage.local.set(patch);
      } catch (e) { logError(e, "history"); }
    });
  }

  // --- custom filters ----------------------------------------------------
  function applyCustom(raw) {
    try {
      settings.customCompiled = Custom ? Custom.compile(raw || {}) : null;
      settings.customActive = !!(Custom && Custom.anyConfigured(settings.customCompiled));
    } catch (e) { logError(e, "custom-compile"); }
  }

  function reportBadge() {
    try {
      var n = document.querySelectorAll('[data-feedhacker-hidden="1"]').length;
      chrome.runtime.sendMessage({ type: "feedhacker:count", count: n });
    } catch (e) { /* messaging unavailable; ignore */ }
  }

  // Activity stats for the options page: how many posts are hidden right now, broken
  // down by filter. Snapshot of the current page (one storage key), throttled so a
  // chatty feed doesn't hammer storage.
  var statsTimer: any = null;
  function recordActivitySoon() {
    if (statsTimer) return;
    statsTimer = setTimeout(function () {
      statsTimer = null;
      try {
        var hidden = document.querySelectorAll('[data-feedhacker-hidden="1"]');
        var by = {};
        for (var i = 0; i < hidden.length; i++) {
          var id = "other";
          try {
            var r = JSON.parse(hidden[i].dataset.feedhackerReasons || "[]");
            if (r[0] && r[0].id) id = r[0].id; else if (r[0] && r[0].label) id = r[0].label;
          } catch (e) {}
          by[id] = (by[id] || 0) + 1;
        }
        var patch = {};
        patch[STATS_KEY] = { total: hidden.length, byId: by, updated: Date.now(), url: location.pathname };
        chrome.storage.local.set(patch);
      } catch (e) { /* stats are best-effort */ }
    }, 2000);
  }

  // Home feed only by default; with scanEverywhere, also permalinks/search/profiles/
  // company pages. LinkedIn is a SPA, so check live each scan.
  function isMainFeed() {
    var p = location.pathname;
    if (SEL) return settings.scanEverywhere ? SEL.isSupportedSurface(p) : SEL.isHomeFeed(p);
    return /^\/feed\/?$/.test(p);
  }

  // DOM-break heartbeat: if we're on a feed but repeatedly find zero post markers,
  // LinkedIn's markup probably changed — surface it once instead of silently doing nothing.
  var noMarkerRuns = 0, heartbeatLogged = false;
  function heartbeat() {
    if (!SEL) return;
    var n = SEL.markerCount(document);
    if (n > 0) { noMarkerRuns = 0; heartbeatLogged = false; return; }
    if (++noMarkerRuns >= 3 && !heartbeatLogged) {
      heartbeatLogged = true;
      logError(new Error("No LinkedIn post markers found on a feed page — selectors may be out of date"), "heartbeat");
    }
  }

  function scanNow() {
    if (!ready) return;
    try {
      // Master switch off, or not on a scanned surface: reveal everything and idle.
      if (!settings.enabled || !isMainFeed()) { F.reset(document); ensureLoadButton(false); reportBadge(); return; }
      F.scan(document, matchers, settings);
      reportBadge();
      recordActivitySoon();
      heartbeat();
      ensureLoadButton(F.anyActive(settings));
    } catch (e) { logError(e, "scan"); }
  }

  // Ask the page-world hook (inject.js) to fire LinkedIn's OWN feed-loader callback.
  function kickLoader(broad) {
    var tok = document.documentElement.getAttribute("data-feedhacker-hook");
    if (!tok) return;   // page-world hook not present
    document.dispatchEvent(new Event((broad ? "feedhacker:kickBroad:" : "feedhacker:kick:") + tok));
  }

  function visibleCount() {
    var posts = F.findPostContainers(document), v = 0;
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      if (!p.classList.contains("feedhacker-hidden") && !p.classList.contains("feedhacker-gone")) v++;
    }
    return v;
  }

  // Load in short bursts until NEW VISIBLE content appears, so a batch that's entirely
  // filtered doesn't dead-end the feed. Bounded (<=8 kicks) so it can't run away; stops
  // early when visible content shows or the user scrolls away (unless forced by button).
  var pumping = false;
  function pump(force) {
    if (pumping || !ready || !settings.enabled || !isMainFeed() || !F.anyActive(settings)) return;
    var se = document.scrollingElement || document.documentElement;
    if (!se) return;
    if (!force && (se.scrollHeight - (window.scrollY + window.innerHeight)) > 1000) return;
    pumping = true;
    var startVisible = visibleCount(), n = 0;
    (function step() {
      var e = document.scrollingElement || document.documentElement;
      var fromBottom = e ? (e.scrollHeight - (window.scrollY + window.innerHeight)) : 0;
      if (n >= 8 || visibleCount() > startVisible || (!force && fromBottom > 1300)) { pumping = false; return; }
      n++;
      kickLoader(false);
      setTimeout(step, 700);
    })();
  }
  // Implicit learning: a slop-flagged post the user scrolled well past (without
  // revealing it) is a weak "confirmed" — train on it once, at a low learning rate.
  function harvestImplicit() {
    if (!settings.implicitLearning || !Scorer) return;
    var hid = document.querySelectorAll('[data-feedhacker-hidden="1"][data-feedhacker-features]');
    for (var i = 0; i < hid.length; i++) {
      var el = hid[i];
      if (el.dataset.feedhackerImplicit === "1" || el.dataset.feedhackerReveal === "1") continue;
      var rect;
      try { rect = el.getBoundingClientRect(); } catch (e) { continue; }
      if (rect.bottom < -1000) {   // scrolled well above the viewport
        el.dataset.feedhackerImplicit = "1";
        try { onFeedback(JSON.parse(el.dataset.feedhackerFeatures), 1, 0.08); } catch (e) {}
      }
    }
  }
  function onUserScroll() { pump(false); harvestImplicit(); }

  // Grafted "Load more" bar — inline at the feed's end, spaced + boxed (a fixed button
  // was hidden behind LinkedIn's Messaging widget). Repositioned as the feed grows;
  // falls back to a floating bar if it can't sit inline.
  function buildLoadBar() {
    var el = document.createElement("div");
    el.id = "feedhacker-loadmore";
    el.className = "feedhacker-loadmore";
    var b = document.createElement("button");
    b.type = "button"; b.className = "feedhacker-loadmore-btn"; b.textContent = "↻  Load more posts";
    b.addEventListener("click", function (e) { e.preventDefault(); pump(true); });
    el.appendChild(b);
    return el;
  }
  function ensureLoadButton(on) {
    var el = document.getElementById("feedhacker-loadmore");
    if (!on) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
    var posts = F.findPostContainers(document);
    if (!posts.length) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
    if (!el) el = buildLoadBar();
    var last = posts[posts.length - 1];
    var list = last.parentNode;
    try {
      if (list && list.parentNode) {                       // sit just AFTER the feed list (spaced, delineated)
        el.classList.remove("feedhacker-loadmore--floating");
        if (list.nextSibling !== el) list.parentNode.insertBefore(el, list.nextSibling);
        return;
      }
    } catch (e) { /* React re-render fought us; fall through to floating */ }
    if (!el.parentNode) {                                   // fallback: floating, clear of the Messaging widget
      el.classList.add("feedhacker-loadmore--floating");
      document.body.appendChild(el);
    }
  }

  // Debounced + idle scan. Coalesces mutation bursts into one scan and runs it when
  // the browser is idle, so a chatty feed doesn't cause layout thrash.
  var ric: any = self.requestIdleCallback || function (cb: any) { return setTimeout(function () { cb({ didTimeout: true }); }, 0); };
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      ric(function () { scanNow(); }, { timeout: 500 });
    }, 200);
  }

  function start() {
    // Skip full rescans on batches that added no real content (e.g. our own stubs,
    // attribute-only churn) — the big win on large, chatty feeds.
    var observer = new MutationObserver(function (records) {
      if (F.mutationsRelevant(records)) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scanNow();
    setInterval(scanNow, 8000);   // slow safety net; the observer drives real-time updates
    var scrollPending = false;
    function onScrollRaf() {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(function () { scrollPending = false; onUserScroll(); });
    }
    window.addEventListener("scroll", onScrollRaf, { passive: true });   // load as you scroll near bottom
  }

  var REMOTE_KEY = "feedhacker:remotebanlist";
  function buildAllMatchers(bundled, remote) {
    var entries = (bundled && bundled.entries) ? bundled.entries.slice() : [];
    if (remote && Array.isArray(remote.entries)) entries = entries.concat(remote.entries);
    return self.FeedHackerMatcher.buildMatchers({ entries: entries });
  }
  function init() {
    fetch(chrome.runtime.getURL("claudisms.json"))
      .then(function (r) {
        if (!r.ok) throw new Error("banlist HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        chrome.storage.local.get([REMOTE_KEY], function (o) {
          var remote = settings.remoteBanlist ? (o && o[REMOTE_KEY]) : null;   // opt-in extra entries
          matchers = buildAllMatchers(data, remote);
          ready = true;
          start();
        });
      })
      .catch(function (err) { logError(err, "banlist-fetch"); });
  }

  // Load settings (sync) + learned weights, custom filters, author memory (local).
  chrome.storage.sync.get(DEFAULTS, function (s) {
    Object.assign(settings, DEFAULTS, s);   // mutate in place so runtime callbacks survive
    chrome.storage.local.get([WEIGHTS_KEY, CUSTOM_KEY, AUTHORS_KEY], function (o) {
      var stored = o && o[WEIGHTS_KEY];
      settings.slopWeights = (stored && typeof stored === "object") ? stored : (Scorer ? Scorer.defaultWeights() : null);
      authorStore = (o && o[AUTHORS_KEY]) || {};
      applyCustom(o && o[CUSTOM_KEY]);
      refreshAuthorFlags();
      init();
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local") {
      if (changes[WEIGHTS_KEY]) {
        var nv = changes[WEIGHTS_KEY].newValue;
        settings.slopWeights = (nv && typeof nv === "object") ? nv : (Scorer ? Scorer.defaultWeights() : settings.slopWeights);
      }
      if (changes[CUSTOM_KEY]) { applyCustom(changes[CUSTOM_KEY].newValue); reapply(); }
      if (changes[AUTHORS_KEY]) { authorStore = changes[AUTHORS_KEY].newValue || {}; refreshAuthorFlags(); reapply(); }
      return;
    }
    if (area !== "sync") return;
    var touched = false;
    for (var k in changes) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        settings[k] = changes[k].newValue;
        touched = true;
      }
    }
    if (touched) reapply();
  });

  function reapply() {
    if (!ready) return;
    F.reset(document);          // reveal everything, then re-apply with new settings
    scanNow();                  // no-ops cleanly if nothing is active
    reportBadge();
  }
})();
