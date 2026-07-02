"use strict";
// FeedHacker options page — properties, activity, and diagnostics. Read-only views
// over chrome.storage plus a master enable toggle and log/learning controls.
var Filters = self.FeedHackerFilters;
var Log = self.FeedHackerLog;
var DEFAULTS = Filters.DEFAULTS;
var WEIGHTS_KEY = "feedhacker:slopWeights";
var STATS_KEY = "feedhacker:stats";

var LABELS = {};
Filters.FILTERS.forEach(function (f) { LABELS[f.id] = f.label; });

function fmtWhen(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, ""); }
  catch (e) { return "—"; }
}

// --- Status: master enable toggle + active-filter summary ---
var enabledBox = document.getElementById("enabled");
var enabledState = document.getElementById("enabled-state");
function paintEnabled(on) {
  enabledBox.checked = !!on;
  enabledState.textContent = on ? "ON" : "OFF (paused)";
  enabledState.className = "state " + (on ? "on" : "off");
}
enabledBox.addEventListener("change", function () {
  chrome.storage.sync.set({ enabled: enabledBox.checked });
  paintEnabled(enabledBox.checked);
});

function renderStatus(st) {
  paintEnabled(st.enabled);
  var active = [];
  Filters.FILTERS.forEach(function (f) {
    if (st["solo" + f.key]) active.push(f.label + " (solo)");
    else if (st["mute" + f.key]) active.push(f.label);
  });
  var extras = [];
  if (st.aggressive) extras.push("aggressive slop");
  if (st.hideSlopComments) extras.push("hide slop comments");
  if (st.hideCompletely) extras.push("hide completely");
  if (st.nameNames) extras.push("name names");
  var el = document.getElementById("active-summary");
  el.textContent = "Active filters: " + (active.length ? active.join(", ") : "none") +
    (extras.length ? " · Options: " + extras.join(", ") : "");
}

// --- Properties from the manifest ---
function renderProps() {
  var m = chrome.runtime.getManifest();
  var rows = [
    ["Name", m.name],
    ["Version", m.version],
    ["Description", m.description],
    ["Manifest", "v" + m.manifest_version],
    ["Permissions", (m.permissions || []).join(", ") || "none"],
    ["Runs on", "www.linkedin.com (home feed only)"],
    ["Extension ID", chrome.runtime.id]
  ];
  var dl = document.getElementById("props");
  dl.innerHTML = "";
  rows.forEach(function (r) {
    var dt = document.createElement("dt"); dt.textContent = r[0];
    var dd = document.createElement("dd"); dd.textContent = r[1];
    dl.appendChild(dt); dl.appendChild(dd);
  });
}

// --- Activity from the last scan snapshot ---
function renderActivity(stats) {
  var box = document.getElementById("activity");
  box.innerHTML = "";
  if (!stats || !stats.total) {
    var p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No hidden posts on the current page yet. Open your LinkedIn feed with filters on.";
    box.appendChild(p);
    return;
  }
  var head = document.createElement("p");
  head.innerHTML = "<b>" + stats.total + "</b> post" + (stats.total === 1 ? "" : "s") +
    " hidden on the last scanned page <span class='muted'>(" + fmtWhen(stats.updated) + ")</span>";
  box.appendChild(head);

  var table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Filter</th><th class='num'>Hidden</th></tr></thead>";
  var tb = document.createElement("tbody");
  var ids = Object.keys(stats.byId || {}).sort(function (a, b) { return stats.byId[b] - stats.byId[a]; });
  ids.forEach(function (id) {
    var tr = document.createElement("tr");
    var name = LABELS[id] || (id === "filtered" ? "Filtered out (solo)" : id);
    tr.innerHTML = "<td></td><td class='num'>" + stats.byId[id] + "</td>";
    tr.firstChild.textContent = name;
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  box.appendChild(table);
}

// --- Error log ---
function renderErrors(list) {
  list = list || [];
  var ul = document.getElementById("errs");
  var empty = document.getElementById("errs-empty");
  ul.innerHTML = "";
  if (!list.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";
  for (var i = list.length - 1; i >= 0; i--) {   // newest first
    var li = document.createElement("li");
    li.textContent = Log.format(list[i]);
    ul.appendChild(li);
  }
}

function loadAll() {
  chrome.storage.sync.get(DEFAULTS, renderStatus);
  chrome.storage.local.get([STATS_KEY, Log.STORAGE_KEY], function (o) {
    renderActivity(o && o[STATS_KEY]);
    renderErrors(o && o[Log.STORAGE_KEY]);
  });
}

document.getElementById("clear-errors").addEventListener("click", function () {
  var patch = {}; patch[Log.STORAGE_KEY] = [];
  chrome.storage.local.set(patch, function () {
    renderErrors([]);
    try { chrome.runtime.sendMessage({ type: "feedhacker:clearError" }); } catch (e) {}
  });
});
document.getElementById("reset-learning").addEventListener("click", function () {
  chrome.storage.local.remove(WEIGHTS_KEY, function () {
    var b = document.getElementById("reset-learning");
    b.textContent = "Learning reset ✓";
    setTimeout(function () { b.textContent = "Reset AI-slop learning"; }, 1600);
  });
});
document.getElementById("refresh").addEventListener("click", loadAll);

// Live updates while the page is open.
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === "sync") chrome.storage.sync.get(DEFAULTS, renderStatus);
  if (area === "local") {
    if (changes[STATS_KEY]) renderActivity(changes[STATS_KEY].newValue);
    if (changes[Log.STORAGE_KEY]) renderErrors(changes[Log.STORAGE_KEY].newValue);
  }
});

renderProps();
loadAll();
