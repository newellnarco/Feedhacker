// FeedHacker for LinkedIn — glue layer.
// Wires the pure matcher (matcher.js) + DOM layer (feed.js) to chrome storage,
// the banlist fetch, a toolbar badge, and a debounced MutationObserver for scroll.
(function () {
  "use strict";

  var DEFAULTS = {
    // per-filter mute (hide this kind) + solo (show only soloed kinds)
    muteSloppy: true,  soloSloppy: false,
    mutePromoted: false, soloPromoted: false,
    muteNewsletter: false, soloNewsletter: false,
    muteHiring: false, soloHiring: false,
    muteLikes: false, soloLikes: false,
    muteJob: false, soloJob: false,
    muteAnniversary: false, soloAnniversary: false,
    muteCert: false, soloCert: false,
    nameNames: false, hideCompletely: false,
    hideSlopComments: false,
    aggressive: false
  };
  var settings = Object.assign({}, DEFAULTS);
  var matchers = [];
  var ready = false;
  var F = self.FeedHackerFeed;

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
    if (!isMainFeed()) { F.reset(document); ensureLoadButton(false); return; } // off everywhere but the feed
    F.scan(document, matchers, settings);
    reportBadge();
    ensureLoadButton(F.anyActive(settings));
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
    b.type = "button"; b.className = "feedhacker-loadmore-btn"; b.textContent = "\u21bb  Load more posts";
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
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; scanNow(); }, 200);
  }

  function start() {
    var observer = new MutationObserver(schedule);
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
      .then(function (r) { return r.json(); })
      .then(function (data) {
        matchers = self.FeedHackerMatcher.buildMatchers(data);
        ready = true;
        start();
      })
      .catch(function (err) { console.error("FeedHacker: failed to load banlist", err); });
  }

  chrome.storage.sync.get(DEFAULTS, function (s) {
    settings = Object.assign({}, DEFAULTS, s);
    init();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
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
