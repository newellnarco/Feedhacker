// FeedHacker for LinkedIn — glue layer.
// Wires the pure matcher (matcher.js), scorer (scorer.js), and DOM layer (feed.js)
// to chrome storage, the banlist fetch, a toolbar badge, the learned slop weights,
// error logging, and a debounced/idle MutationObserver for scroll.
(function () {
  "use strict";

  var Filters = self.FeedHackerFilters;
  var Log = self.FeedHackerLog;
  var Scorer = self.FeedHackerScorer;
  var DEFAULTS = Filters.DEFAULTS;
  var WEIGHTS_KEY = "feedhacker:slopWeights";

  var settings = Object.assign({}, DEFAULTS);
  var matchers = [];
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
  var weightsDirty = false, weightsSaveTimer = null;
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
  // step nudges the weights; future posts use the updated model immediately.
  function onFeedback(features, label) {
    try {
      if (!Scorer) return;
      settings.slopWeights = Scorer.learn(settings.slopWeights, features, label, 0.3);
      weightsDirty = true;
      saveWeightsSoon();
    } catch (e) { logError(e, "learn"); }
  }
  settings.onFeedback = onFeedback;

  function reportBadge() {
    try {
      var n = document.querySelectorAll('[data-feedhacker-hidden="1"]').length;
      chrome.runtime.sendMessage({ type: "feedhacker:count", count: n });
    } catch (e) { /* messaging unavailable; ignore */ }
  }

  // Only operate on the HOME feed ("/feed/"), not single-post permalinks
  // ("/feed/update/..."), profiles, search, etc. LinkedIn is a SPA, so check live.
  function isMainFeed() {
    return /^\/feed\/?$/.test(location.pathname);
  }

  function scanNow() {
    if (!ready) return;
    try {
      if (!isMainFeed()) { F.reset(document); ensureLoadButton(false); return; } // off everywhere but the feed
      F.scan(document, matchers, settings);
      reportBadge();
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
    if (pumping || !ready || !isMainFeed() || !F.anyActive(settings)) return;
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
  function onUserScroll() { pump(false); }

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
  var ric = self.requestIdleCallback || function (cb) { return setTimeout(function () { cb({ didTimeout: true }); }, 0); };
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

  function init() {
    fetch(chrome.runtime.getURL("claudisms.json"))
      .then(function (r) {
        if (!r.ok) throw new Error("banlist HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        matchers = self.FeedHackerMatcher.buildMatchers(data);
        ready = true;
        start();
      })
      .catch(function (err) { logError(err, "banlist-fetch"); });
  }

  // Load settings (sync) + learned weights (local) before starting.
  chrome.storage.sync.get(DEFAULTS, function (s) {
    settings = Object.assign({}, DEFAULTS, s);
    settings.onFeedback = onFeedback;
    chrome.storage.local.get([WEIGHTS_KEY], function (o) {
      var stored = o && o[WEIGHTS_KEY];
      settings.slopWeights = (stored && typeof stored === "object") ? stored : (Scorer ? Scorer.defaultWeights() : null);
      init();
    });
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[WEIGHTS_KEY]) {
      var nv = changes[WEIGHTS_KEY].newValue;
      settings.slopWeights = (nv && typeof nv === "object") ? nv : (Scorer ? Scorer.defaultWeights() : settings.slopWeights);
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
    if (touched) {
      F.reset(document);          // live toggle: reveal everything, then re-apply
      scanNow();                  // scanNow no-ops cleanly if all filters are off
      reportBadge();
    }
  });
})();
