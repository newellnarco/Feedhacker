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
  box.appendChild(row);
});

function paint(b, on) {
  var cls = b.dataset.kind === "m" ? "m-on" : "s-on";
  b.classList.toggle(cls, !!on);
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
  byId("groupHiddenRuns").checked = st.groupHiddenRuns !== false;   // default on
});

// Group flagged posts: collapse a run of hidden posts into one summary row (default on).
byId("groupHiddenRuns").addEventListener("change", function (e) {
  chrome.storage.sync.set({ groupHiddenRuns: e.target.checked });
});

byId("open-options").addEventListener("click", function () {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
});

// AI-slop AGGRESSION slider. It sets the TARGET FRACTION of posts to hide (slopTargetFrac),
// which is what the self-tuning honors — moving it actually sticks, unlike a raw threshold
// (which auto-calibration overwrites each cycle). We also write a matching static threshold so
// it still takes effect immediately, and when self-tuning is off.
var aggr = byId("aggression");
var aggrVal = byId("aggressionVal");
function fracToThreshold(frac) {
  var t = 0.72 - Number(frac);          // more aggressive (bigger fraction) => lower cutoff
  return t < 0.3 ? 0.3 : t > 0.75 ? 0.75 : t;
}
function aggrLabel(f) {
  f = Number(f);
  var word = f >= 0.4 ? "aggressive" : f <= 0.17 ? "strict" : "balanced";
  return word + " (~" + Math.round(f * 100) + "% hidden)";
}
chrome.storage.sync.get({ slopTargetFrac: DEFAULTS.slopTargetFrac }, function (st) {
  aggr.value = st.slopTargetFrac;
  aggrVal.textContent = aggrLabel(st.slopTargetFrac);
});
aggr.addEventListener("input", function () { aggrVal.textContent = aggrLabel(aggr.value); });
aggr.addEventListener("change", function () {
  var f = Number(aggr.value);
  chrome.storage.sync.set({ slopTargetFrac: f, slopThreshold: fracToThreshold(f) });
});

document.querySelectorAll(".ms").forEach(function (b) {
  b.addEventListener("click", function () {
    chrome.storage.sync.get(DEFAULTS, function (st) {
      var nv = !st[b.dataset.key];
      var patch: any = {}; patch[b.dataset.key] = nv;
      chrome.storage.sync.set(patch);
      for (var k in patch) {
        var btn = document.querySelector('.ms[data-key="' + k + '"]') as any;
        if (btn) paint(btn, patch[k]);
      }
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
