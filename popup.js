"use strict";
// Popup UI — the Mute/Solo mixer. Filter list + defaults come from the shared
// filters.js (single source of truth). Also surfaces the error log and lets the
// user clear errors or reset the learned AI-slop weights.
var Filters = self.FeedHackerFilters;
var Log = self.FeedHackerLog;
var FILTERS = Filters.FILTERS;                 // [{id, key, label}]
var DISPLAY = Filters.DISPLAY_KEYS;
var DEFAULTS = Filters.DEFAULTS;
var WEIGHTS_KEY = "feedhacker:slopWeights";

var box = document.getElementById("filters");
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

// Master enable/disable — pauses all filtering without uninstalling.
var enabledBox = document.getElementById("enabled");
var masterEl = document.getElementById("master");
var pausedNote = document.getElementById("paused-note");
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
  DISPLAY.forEach(function (id) { document.getElementById(id).checked = !!st[id]; });
});

document.getElementById("open-options").addEventListener("click", function () {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
});

// AI-slop sensitivity slider. Lower threshold = more aggressive hiding. Label the
// extremes so the number means something.
var slop = document.getElementById("slopThreshold");
var slopVal = document.getElementById("slopThresholdVal");
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
      var patch = {}; patch[b.dataset.key] = nv;
      chrome.storage.sync.set(patch);
      paint(b, nv);
    });
  });
});
DISPLAY.forEach(function (id) {
  document.getElementById(id).addEventListener("change", function (e) {
    var p = {}; p[id] = e.target.checked; chrome.storage.sync.set(p);
  });
});

// --- error log ------------------------------------------------------------
var errBox = document.getElementById("errors");
var errList = document.getElementById("err-list");
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
document.getElementById("clear-errors").addEventListener("click", function () {
  var patch = {}; patch[Log.STORAGE_KEY] = [];
  chrome.storage.local.set(patch, function () {
    renderErrors([]);
    try { chrome.runtime.sendMessage({ type: "feedhacker:clearError" }); } catch (e) {}
  });
});

// --- reset learning -------------------------------------------------------
document.getElementById("reset-learning").addEventListener("click", function () {
  chrome.storage.local.remove(WEIGHTS_KEY, function () {
    var btn = document.getElementById("reset-learning");
    btn.textContent = "Learning reset ✓";
    setTimeout(function () { btn.textContent = "Reset AI-slop learning"; }, 1600);
  });
});
