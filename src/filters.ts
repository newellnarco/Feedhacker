// FeedHacker — shared filter definitions. Single source of truth for the filter
// list, storage keys, and defaults. Consumed by content.js (glue), popup.js (UI),
// feed.js (DOM layer), and the test suite, so a filter is defined in exactly one
// place. Storage keys are "mute<Key>" / "solo<Key>"; the DOM layer uses the
// lowercase "id". key === cap(id) is an invariant enforced by a test.
(function (root) {
  "use strict";

  // Order here IS the display order in the popup and the scan order in feed.js.
  // sloppy/promoted/... are DOM/heuristic filters; job/anniversary/cert are the
  // text-regex CATEGORIES in feed.js. defaultMute seeds DEFAULTS (only AI slop on).
  var FILTERS = [
    { id: "sloppy",      key: "Sloppy",      label: "AI slop",                 defaultMute: true  },
    { id: "promoted",    key: "Promoted",    label: "Promoted posts",          defaultMute: false },
    { id: "company",     key: "Company",     label: "Company / brand posts",   defaultMute: false },
    { id: "newsletter",  key: "Newsletter",  label: "Newsletter signups",      defaultMute: false },
    { id: "hiring",      key: "Hiring",      label: "Hiring posts",            defaultMute: false },
    { id: "likes",       key: "Likes",       label: "Reaction reshares",       defaultMute: false },
    { id: "job",         key: "Job",         label: "New-job announcements",   defaultMute: false },
    { id: "anniversary", key: "Anniversary", label: "Work anniversaries",      defaultMute: false },
    { id: "cert",        key: "Cert",        label: "Training & certification", defaultMute: false }
  ];

  // Non-per-filter boolean settings (checkboxes in the popup).
  var DISPLAY_KEYS = ["nameNames", "nameSample", "hideCompletely", "hideSlopComments", "digest"];

  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }

  var FILTER_IDS = FILTERS.map(function (f) { return f.id; });

  // Build the full DEFAULTS object used by chrome.storage.get everywhere.
  function buildDefaults() {
    var d: any = {};
    for (var i = 0; i < FILTERS.length; i++) {
      var f = FILTERS[i];
      d["mute" + f.key] = !!f.defaultMute;
      d["solo" + f.key] = false;
    }
    for (var j = 0; j < DISPLAY_KEYS.length; j++) d[DISPLAY_KEYS[j]] = false;
    d.enabled = true;            // master on/off; pause without uninstalling
    d.slopThreshold = 0.5;       // AI-slop confidence cutoff (0.2 lax .. 0.8 strict)
    d.implicitLearning = true;   // learn weak "confirmed" from posts scrolled past
    d.scanEverywhere = false;    // beyond the home feed (permalinks, search, profiles)
    return d;
  }
  var DEFAULTS = buildDefaults();

  // Keys the content script tracks live (everything in DEFAULTS). slopWeights is
  // handled separately (it lives in storage.local and is large/learned).
  var api = {
    FILTERS: FILTERS,
    FILTER_IDS: FILTER_IDS,
    DISPLAY_KEYS: DISPLAY_KEYS,
    DEFAULTS: DEFAULTS,
    buildDefaults: buildDefaults,
    cap: cap
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerFilters = api;
})(typeof self !== "undefined" ? self : this);
