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

  // --- extension-context lifecycle ----------------------------------------
  // Chrome auto-updates (or a manual reload) swap in a new extension context and
  // ORPHAN the content script already running in an open LinkedIn tab: chrome.runtime.id
  // goes undefined, every chrome.* call throws "Extension context invalidated", and any
  // chrome-extension://<id>/… reference the page still holds resolves to the sentinel
  // chrome-extension://invalid/. We can't fix the orphaned page, but we CAN stop doing
  // work in it — disconnect the observer, drop the timers/listeners, and pull our injected
  // UI — so the dead tab stays quiet until the user navigates (which reloads us fresh).
  var mainObserver: any = null, scanTimer: any = null, scrollHandler: any = null, dead = false;
  function contextAlive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }
  function teardown() {
    if (dead) return;
    dead = true;
    try { if (mainObserver) mainObserver.disconnect(); } catch (e) {}
    try { if (scanTimer) clearInterval(scanTimer); } catch (e) {}
    try { if (scrollHandler) window.removeEventListener("scroll", scrollHandler); } catch (e) {}
    try { F.reset(document); } catch (e) {}   // reveal anything we hid, so a dead tab isn't left filtering
    try { var lb = document.getElementById("feedhacker-loadmore"); if (lb && lb.parentNode) lb.parentNode.removeChild(lb); } catch (e) {}
  }

  // --- error logging -------------------------------------------------------
  // Append a timestamped entry to storage.local and tell the service worker to
  // flip the badge to an error state. Everything here is defensive: logging must
  // never itself throw and take the extension down.
  function logError(err, context) {
    if (dead) return;
    // A dead context is expected after an update, not a bug — don't console-spam or flag
    // the badge for it. Tear down instead so the orphaned tab goes quiet.
    if (!contextAlive()) { teardown(); return; }
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
      if (settings.autoCalibrate) return;   // autonomous calibration owns the weights; single clicks don't move them
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
      if (ready) { F.reset(document, true); scanNow(); reportBadge(); }   // apply immediately (keep user Hide/Show actions)
    } catch (e) { logError(e, "mute-author"); }
  }
  settings.onMuteAuthor = onMuteAuthor;
  function onAllowAuthor(info) {
    try {
      if (!Authors) return;
      authorStore = Authors.allow(authorStore, Authors.keyFor(info), info && info.name);
      refreshAuthorFlags();
      authorsDirty = true; saveAuthorsSoon();
      if (ready) { F.reset(document, true); scanNow(); reportBadge(); }   // reveal now + keep showing
    } catch (e) { logError(e, "allow-author"); }
  }
  settings.onAllowAuthor = onAllowAuthor;
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

  // --- AI-slop decision log + local recalibration -------------------------
  // Every slop flag is logged with its "why" (probability, tells, phrases, preview) so the
  // user can see what tripped it and export it; every user correction becomes a labeled
  // example that periodically re-fits the weights locally (regularized toward the shipped
  // defaults). Both are best-effort: they must never take filtering down.
  var SlopLog = self.FeedHackerSlopLog;
  var TRAIN_KEY = "feedhacker:sloptrain";
  var TRAIN_MAX = 500, RETUNE_EVERY = 6;
  var slopPending: any[] = [], slopFlushTimer: any = null, newLabels = 0;

  function flushSlopLog() {
    slopFlushTimer = null;
    if (!SlopLog || !slopPending.length) return;
    var batch = slopPending; slopPending = [];
    chrome.storage.local.get([SlopLog.STORAGE_KEY], function (o) {
      try {
        var list = (o && o[SlopLog.STORAGE_KEY]) || [];
        for (var i = 0; i < batch.length; i++) list = SlopLog.push(list, batch[i]);
        var patch = {}; patch[SlopLog.STORAGE_KEY] = list; chrome.storage.local.set(patch);
      } catch (e) { logError(e, "sloplog"); }
    });
  }
  function onSlopDecision(d) {
    try {
      if (!SlopLog) return;
      slopPending.push(SlopLog.makeEntry(d, Date.now()));
      if (!slopFlushTimer) slopFlushTimer = setTimeout(flushSlopLog, 2000);
    } catch (e) {}
  }
  settings.onSlopDecision = onSlopDecision;

  // Keep only the numeric feature values (no matched text) for the training buffer.
  function cleanFeatures(feats) {
    var out: any = {};
    if (!Scorer || !feats) return out;
    for (var i = 0; i < Scorer.FEATURE_IDS.length; i++) {
      var id = Scorer.FEATURE_IDS[i];
      out[id] = typeof feats[id] === "number" ? feats[id] : 0;
    }
    return out;
  }
  function onSlopVerdict(id, label, feats) {
    try {
      if (!SlopLog) return;
      var lab = label ? 1 : 0;
      // Stamp any not-yet-flushed decision in memory so a fast correction isn't lost.
      for (var p = 0; p < slopPending.length; p++) if (slopPending[p].id === id) slopPending[p].label = lab;
      chrome.storage.local.get([SlopLog.STORAGE_KEY, TRAIN_KEY], function (o) {
        try {
          var list = (o && o[SlopLog.STORAGE_KEY]) || [];
          if (id) list = SlopLog.applyVerdict(list, id, lab, Date.now());
          var patch: any = {}; patch[SlopLog.STORAGE_KEY] = list;
          if (feats && Scorer) {
            var train = (o && o[TRAIN_KEY]) || [];
            var ex = { id: id || String(Date.now()), features: cleanFeatures(feats), label: lab, ts: Date.now() };
            var replaced = false;   // one example per decision — a changed mind overwrites
            for (var i = 0; i < train.length; i++) if (id && train[i] && train[i].id === id) { train[i] = ex; replaced = true; break; }
            if (!replaced) train.push(ex);
            if (train.length > TRAIN_MAX) train = train.slice(train.length - TRAIN_MAX);
            patch[TRAIN_KEY] = train;
            // Label-driven retune only when the autonomous loop is OFF (otherwise it owns the model).
            if (!settings.autoCalibrate && ++newLabels >= RETUNE_EVERY) { newLabels = 0; recalibrate(train); }
          }
          chrome.storage.local.set(patch);
        } catch (e) { logError(e, "slop-verdict"); }
      });
    } catch (e) {}
  }
  settings.onSlopVerdict = onSlopVerdict;

  // Batch-refit slop weights from ALL labeled corrections. Regularized toward the shipped
  // defaults (in Scorer.retrain) so a lopsided buffer softens the model without collapsing
  // it. Applied live and persisted.
  function recalibrate(train) {
    try {
      if (!Scorer || !train || train.length < 4) return;
      settings.slopWeights = Scorer.retrain(Scorer.defaultWeights(), train, {});
      var patch = {}; patch[WEIGHTS_KEY] = settings.slopWeights; chrome.storage.local.set(patch);
    } catch (e) { logError(e, "recalibrate"); }
  }

  // --- autonomous auto-calibration (no user labels) -----------------------
  // FeedHacker watches the population of posts it reviews and periodically re-fits the model
  // ITSELF: it down-weights tells that fire on most posts (uninformative here) and sets the
  // threshold from the score distribution so only the sloppiest ~slopTargetFrac is hidden.
  // This is the primary "get smarter" loop — it needs no clicks from the user.
  var OBS_KEY = "feedhacker:slopobs", CAL_KEY = "feedhacker:slopcal";
  var OBS_MAX = 400, CAL_MIN = 30, CAL_INTERVAL = 45000;   // recalibrate at most ~once per 45s
  var CAL_ALPHA = 0.6;   // how far the running model moves toward each new target (living EMA)
  var obsPending: any[] = [], obsFlushTimer: any = null, lastCalAt = 0;

  function onSlopObserve(feats) {
    try {
      if (!Scorer || !settings.autoCalibrate) return;
      obsPending.push({ features: cleanFeatures(feats) });
      if (!obsFlushTimer) obsFlushTimer = setTimeout(flushObs, 3000);
    } catch (e) {}
  }
  settings.onSlopObserve = onSlopObserve;

  function flushObs() {
    obsFlushTimer = null;
    if (!obsPending.length) return;
    var batch = obsPending; obsPending = [];
    chrome.storage.local.get([OBS_KEY], function (o) {
      try {
        var list = ((o && o[OBS_KEY]) || []).concat(batch);
        if (list.length > OBS_MAX) list = list.slice(list.length - OBS_MAX);
        var patch = {}; patch[OBS_KEY] = list; chrome.storage.local.set(patch);
        // Time-gated so a calibration's own reapply()-driven re-scan can't loop back into another.
        if (settings.autoCalibrate && list.length >= CAL_MIN && (Date.now() - lastCalAt) >= CAL_INTERVAL) {
          lastCalAt = Date.now();   // claim the slot before the async fetch so a concurrent flush can't double-fire
          // Only read the (larger) training buffer on the rare calibration path, not every flush.
          chrome.storage.local.get([TRAIN_KEY], function (t) { runAutoCalibrate(list, (t && t[TRAIN_KEY]) || []); });
        }
      } catch (e) { logError(e, "slopobs"); }
    });
  }

  // One "living" calibration step: evolve the CURRENT running model toward the autonomous
  // target (population damping + distribution threshold), with a gentle nudge from the user's
  // labeled corrections folded in. The model keeps learning from its latest state across
  // sessions rather than resetting to the shipped defaults.
  function runAutoCalibrate(obs, train) {
    try {
      if (!Scorer || !Scorer.liveCalibrate || !settings.autoCalibrate || !obs) return;
      lastCalAt = Date.now();   // set BEFORE reapply so the re-scan it triggers can't re-enter
      var r = Scorer.liveCalibrate({
        current: settings.slopWeights,
        currentThreshold: typeof settings.slopThreshold === "number" ? settings.slopThreshold : 0.5,
        defaults: Scorer.defaultWeights(),
        observations: obs,
        labels: train || [],
        targetFrac: typeof settings.slopTargetFrac === "number" ? settings.slopTargetFrac : 0.28,
        alpha: CAL_ALPHA
      });
      if (!r || !r.calibrated) return;
      settings.slopWeights = r.weights;
      settings.slopThreshold = r.threshold;
      // One local write (weights + status together) to avoid a redundant storage-change event.
      var patch: any = {};
      patch[WEIGHTS_KEY] = r.weights;
      patch[CAL_KEY] = { at: Date.now(), threshold: r.threshold, flaggedFrac: r.flaggedFrac, freqs: r.freqs, n: obs.length, labels: r.labelsUsed };
      chrome.storage.local.set(patch);
      try { chrome.storage.sync.set({ slopThreshold: r.threshold }); } catch (e) {}
      if (ready) reapply();   // re-evaluate what's on screen with the freshly tuned model
    } catch (e) { logError(e, "autocalibrate"); }
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
  function tabActive() {
    // Only trust "no markers" when the user is actually looking at the feed. A backgrounded
    // tab, a minimized window, or switching to another app pauses LinkedIn's feed rendering,
    // so zero markers there is expected — not a broken selector.
    // Fail closed: if the visibility/focus probes throw, treat the tab as inactive so an
    // uncertain state never contributes to the "selectors out of date" alarm.
    try {
      if (document.hidden) return false;
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  function heartbeat() {
    if (!SEL) return;
    if (!tabActive()) { noMarkerRuns = 0; return; }   // tab hidden/unfocused — don't count it
    var n = SEL.markerCount(document);
    if (n > 0) { noMarkerRuns = 0; heartbeatLogged = false; return; }
    if (++noMarkerRuns >= 3 && !heartbeatLogged) {
      heartbeatLogged = true;
      logError(new Error("No LinkedIn post markers found on a feed page — selectors may be out of date"), "heartbeat");
    }
  }

  function scanNow() {
    if (dead) return;
    if (!contextAlive()) { teardown(); return; }   // orphaned after an update — stop cleanly
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
  function onUserScroll() { if (dead) return; pump(false); harvestImplicit(); }

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
    mainObserver = new MutationObserver(function (records) {
      if (dead) return;
      if (F.mutationsRelevant(records)) schedule();
    });
    mainObserver.observe(document.documentElement, { childList: true, subtree: true });
    scanNow();
    scanTimer = setInterval(scanNow, 8000);   // slow safety net; the observer drives real-time updates
    var scrollPending = false;
    scrollHandler = function onScrollRaf() {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(function () { scrollPending = false; onUserScroll(); });
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });   // load as you scroll near bottom
  }

  // The banlist ships bundled (banlist.js sets self.FeedHackerBanlist) rather than being
  // fetched from a web-accessible resource. Fetching the packaged banlist over the extension
  // origin on linkedin.com left an entry in the page's Resource Timing and required the JSON to
  // be web-accessible — surface a site's own telemetry could enumerate and (after a context
  // swap) probe as chrome-extension://invalid/. Reading a bundled global keeps our page
  // footprint to just the injected content scripts and needs no web_accessible_resources.
  function init() {
    try {
      var data = (self as any).FeedHackerBanlist || { entries: [] };
      var entries = (data && data.entries) ? data.entries : [];
      matchers = self.FeedHackerMatcher.buildMatchers({ entries: entries });
      ready = true;
      start();
    } catch (err) { logError(err, "banlist-init"); }
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
    F.reset(document, true);    // re-apply with new settings, but keep the user's Hide/Show-anyway choices
    scanNow();                  // no-ops cleanly if nothing is active
    reportBadge();
  }
})();
