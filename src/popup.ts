// Popup UI — the Mute/Solo mixer. Filter list + defaults come from the shared
// filters.js (single source of truth). Also surfaces the error log and lets the
// user clear errors or reset the learned AI-slop weights.
(function () {
"use strict";
var byId = function (id) { return document.getElementById(id) as any; };
var Filters = self.FeedHackerFilters;
var Log = self.FeedHackerLog;
var FILTERS = Filters.FILTERS;                 // [{id, key, label}]
var DISPLAY = Filters.DISPLAY_KEYS;
var DEFAULTS = Filters.DEFAULTS;
var WEIGHTS_KEY = "feedhacker:slopWeights";

var box = byId("filters");
FILTERS.forEach(function (f) {
  var row = document.createElement("div"); row.className = "frow";
  var name = document.createElement("span"); name.className = "fname"; name.textContent = f.label;
  var m = document.createElement("button"); m.className = "ms"; m.textContent = "M"; m.dataset.key = "mute" + f.key; m.dataset.kind = "m";
  var s = document.createElement("button"); s.className = "ms"; s.textContent = "S"; s.dataset.key = "solo" + f.key; s.dataset.kind = "s";
  row.appendChild(name); row.appendChild(m); row.appendChild(s);
  if (f.id === "sloppy") {   // Aggressive toggle sits next to AI slop
    var a = document.createElement("button"); a.className = "ms"; a.textContent = "A"; a.dataset.key = "aggressive"; a.dataset.kind = "a";
    a.title = "Aggressive: also apply broader, higher-false-positive AI-slop rules";
    row.appendChild(a);
  }
  box.appendChild(row);
});

function paint(b, on) {
  var cls = b.dataset.kind === "m" ? "m-on" : b.dataset.kind === "s" ? "s-on" : "a-on";
  b.classList.toggle(cls, !!on);
}

// Aggressive is a modifier on the AI-slop Mute, not a filter of its own — it does
// nothing unless AI slop is muted. So we couple them: clicking A also turns M on,
// turning M off clears A, and A is dimmed (with a hint) whenever M is off.
var aggBtn = document.querySelector('.ms[data-key="aggressive"]') as any;
function paintAggAvailability(muteOn) {
  if (!aggBtn) return;
  aggBtn.classList.toggle("ms-dim", !muteOn);
  aggBtn.title = muteOn
    ? "Aggressive: also apply broader, higher-false-positive AI-slop rules"
    : "Turn on Mute (M) for AI slop to use Aggressive";
}

// Master enable/disable — pauses all filtering without uninstalling.
var enabledBox = byId("enabled");
var masterEl = byId("master");
var pausedNote = byId("paused-note");
function paintMaster(on) {
  enabledBox.checked = !!on;
  masterEl.classList.toggle("off", !on);
  pausedNote.classList.toggle("show", !on);
}
enabledBox.addEventListener("change", function () {
  chrome.storage.sync.set({ enabled: enabledBox.checked });
  paintMaster(enabledBox.checked);
});

chrome.storage.sync.get(DEFAULTS, function (st) {
  paintMaster(st.enabled);
  document.querySelectorAll(".ms").forEach(function (b) { paint(b, st[b.dataset.key]); });
  DISPLAY.forEach(function (id) { byId(id).checked = !!st[id]; });
  paintAggAvailability(st.muteSloppy);
});

byId("open-options").addEventListener("click", function () {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
});

// AI-slop sensitivity slider. Lower threshold = more aggressive hiding. Label the
// extremes so the number means something.
var slop = byId("slopThreshold");
var slopVal = byId("slopThresholdVal");
function slopLabel(v) {
  v = Number(v);
  var word = v <= 0.35 ? "aggressive" : v >= 0.65 ? "strict" : "balanced";
  return word + " (" + v.toFixed(2) + ")";
}
chrome.storage.sync.get({ slopThreshold: DEFAULTS.slopThreshold }, function (st) {
  slop.value = st.slopThreshold;
  slopVal.textContent = slopLabel(st.slopThreshold);
});
slop.addEventListener("input", function () { slopVal.textContent = slopLabel(slop.value); });
slop.addEventListener("change", function () { chrome.storage.sync.set({ slopThreshold: Number(slop.value) }); });

document.querySelectorAll(".ms").forEach(function (b) {
  b.addEventListener("click", function () {
    chrome.storage.sync.get(DEFAULTS, function (st) {
      var nv = !st[b.dataset.key];
      var patch: any = {}; patch[b.dataset.key] = nv;
      // Couple Aggressive to the AI-slop Mute: A implies M; clearing M clears A.
      if (b.dataset.key === "aggressive" && nv && !st.muteSloppy) patch.muteSloppy = true;
      if (b.dataset.key === "muteSloppy" && !nv && st.aggressive) patch.aggressive = false;
      chrome.storage.sync.set(patch);
      for (var k in patch) {
        var btn = document.querySelector('.ms[data-key="' + k + '"]') as any;
        if (btn) paint(btn, patch[k]);
      }
      paintAggAvailability(patch.muteSloppy != null ? patch.muteSloppy : st.muteSloppy);
    });
  });
});
DISPLAY.forEach(function (id) {
  byId(id).addEventListener("change", function (e) {
    var p = {}; p[id] = e.target.checked; chrome.storage.sync.set(p);
  });
});

// --- error log ------------------------------------------------------------
var errBox = byId("errors");
var errList = byId("err-list");
function renderErrors(list) {
  list = list || [];
  errList.innerHTML = "";
  if (!list.length) { errBox.classList.remove("show"); return; }
  errBox.classList.add("show");
  // newest first
  for (var i = list.length - 1; i >= 0; i--) {
    var li = document.createElement("li");
    li.className = "err-item";
    li.textContent = Log.format(list[i]);
    errList.appendChild(li);
  }
}
chrome.storage.local.get([Log.STORAGE_KEY], function (o) {
  renderErrors(o && o[Log.STORAGE_KEY]);
});
byId("clear-errors").addEventListener("click", function () {
  var patch = {}; patch[Log.STORAGE_KEY] = [];
  chrome.storage.local.set(patch, function () {
    renderErrors([]);
    try { chrome.runtime.sendMessage({ type: "feedhacker:clearError" }); } catch (e) {}
  });
});

// --- reset learning -------------------------------------------------------
byId("reset-learning").addEventListener("click", function () {
  chrome.storage.local.remove(WEIGHTS_KEY, function () {
    var btn = byId("reset-learning");
    btn.textContent = "Learning reset ✓";
    setTimeout(function () { btn.textContent = "Reset AI-slop learning"; }, 1600);
  });
});
})();
