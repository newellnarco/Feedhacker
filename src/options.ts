// FeedHacker options page — properties, activity, and diagnostics. Read-only views
// over chrome.storage plus a master enable toggle and log/learning controls.
(function () {
"use strict";
var Filters = self.FeedHackerFilters;
var Log = self.FeedHackerLog;
var Authors = self.FeedHackerAuthors;
var DEFAULTS = Filters.DEFAULTS;
var WEIGHTS_KEY = "feedhacker:slopWeights";
var STATS_KEY = "feedhacker:stats";
var CUSTOM_KEY = "feedhacker:custom";
var AUTHORS_KEY = "feedhacker:authors";
var HISTORY_KEY = "feedhacker:history";
var REMOTE_KEY = "feedhacker:remotebanlist";

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

  document.getElementById("scanEverywhere").checked = !!st.scanEverywhere;
  document.getElementById("implicitLearning").checked = !!st.implicitLearning;
  document.getElementById("remoteBanlist").checked = !!st.remoteBanlist;
  document.getElementById("remoteBanlistUrl").value = st.remoteBanlistUrl || "";
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
  chrome.storage.local.get([STATS_KEY, Log.STORAGE_KEY, CUSTOM_KEY, AUTHORS_KEY, HISTORY_KEY], function (o) {
    renderActivity(o && o[STATS_KEY]);
    renderErrors(o && o[Log.STORAGE_KEY]);
    renderCustom(o && o[CUSTOM_KEY]);
    renderAuthors(o && o[AUTHORS_KEY]);
    renderInsights(o && o[HISTORY_KEY]);
    renderTopSources(o && o[AUTHORS_KEY]);
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

// --- Insights (daily history + top sources) ---
function renderInsights(history) {
  var box = document.getElementById("insights");
  box.innerHTML = "";
  var days = Object.keys(history || {}).sort().reverse();
  if (!days.length) { box.innerHTML = "<p class='empty'>No history yet.</p>"; return; }
  var max = 0;
  days.forEach(function (d) { if (history[d].total > max) max = history[d].total; });
  var table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Day</th><th class='num'>Hidden</th></tr></thead>";
  var tb = document.createElement("tbody");
  days.slice(0, 14).forEach(function (d) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td>" + d + "</td><td class='num'>" + history[d].total + "</td>";
    tb.appendChild(tr);
  });
  table.appendChild(tb); box.appendChild(table);
}
function renderTopSources(store) {
  var box = document.getElementById("top-sources");
  box.innerHTML = "";
  var top = Authors ? Authors.topSources(store, 8).filter(function (a) { return a.hidden > 0; }) : [];
  if (!top.length) { box.innerHTML = "<p class='empty'>No author data yet.</p>"; return; }
  var table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Author</th><th class='num'>Hidden</th><th class='num'>Shown</th></tr></thead>";
  var tb = document.createElement("tbody");
  top.forEach(function (a) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td class='num'>" + a.hidden + "</td><td class='num'>" + a.shown + "</td>";
    tr.firstChild.textContent = a.name || a.key;
    tb.appendChild(tr);
  });
  table.appendChild(tb); box.appendChild(table);
}

// --- Custom filters ---
function linesToArr(v) { return String(v || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }
function renderCustom(c) {
  c = c || {};
  document.getElementById("cf-words").value = (c.words || []).join("\n");
  document.getElementById("cf-regexes").value = (c.regexes || []).join("\n");
  document.getElementById("cf-hashtags").value = (c.hashtags || []).join("\n");
  document.getElementById("cf-companies").value = (c.companies || []).join("\n");
}
document.getElementById("cf-save").addEventListener("click", function () {
  var c = {
    words: linesToArr(document.getElementById("cf-words").value),
    regexes: linesToArr(document.getElementById("cf-regexes").value),
    hashtags: linesToArr(document.getElementById("cf-hashtags").value),
    companies: linesToArr(document.getElementById("cf-companies").value)
  };
  var patch = {}; patch[CUSTOM_KEY] = c;
  chrome.storage.local.set(patch, function () {
    var s = document.getElementById("cf-status"); s.textContent = "Saved ✓";
    setTimeout(function () { s.textContent = ""; }, 1500);
  });
});

// --- Authors (muted / allowed chips) ---
function renderAuthors(store) {
  store = Authors ? Authors.ensure(store) : (store || { muted: {}, allowed: {}, scores: {} });
  function nameOf(key) { return (store.scores[key] && store.scores[key].name) || key; }
  function fill(id, keys, remove) {
    var ul = document.getElementById(id); ul.innerHTML = "";
    if (!keys.length) { ul.innerHTML = "<li class='empty' style='background:none;padding:2px'>none</li>"; return; }
    keys.forEach(function (key) {
      var li = document.createElement("li");
      var span = document.createElement("span"); span.textContent = nameOf(key);
      var x = document.createElement("button"); x.textContent = "×"; x.title = "Remove";
      x.addEventListener("click", function () { remove(key); });
      li.appendChild(span); li.appendChild(x); ul.appendChild(li);
    });
  }
  fill("muted-list", Object.keys(store.muted), function (key) {
    var s = Authors.unmute(store, key); saveAuthors(s);
  });
  fill("allowed-list", Object.keys(store.allowed), function (key) {
    var s = Authors.unallow(store, key); saveAuthors(s);
  });
}
function saveAuthors(store) {
  var patch = {}; patch[AUTHORS_KEY] = store;
  chrome.storage.local.set(patch, function () { renderAuthors(store); });
}

// --- Advanced toggles (sync) ---
["scanEverywhere", "implicitLearning", "remoteBanlist"].forEach(function (id) {
  var el = document.getElementById(id);
  el.addEventListener("change", function () { var p = {}; p[id] = el.checked; chrome.storage.sync.set(p); });
});
var remoteUrl = document.getElementById("remoteBanlistUrl");
remoteUrl.addEventListener("change", function () { chrome.storage.sync.set({ remoteBanlistUrl: remoteUrl.value.trim() }); });

document.getElementById("remote-fetch").addEventListener("click", function () {
  var status = document.getElementById("remote-status");
  var url = remoteUrl.value.trim();
  if (!url) { status.textContent = "Enter a URL first."; return; }
  var origin;
  try { origin = new URL(url).origin + "/*"; } catch (e) { status.textContent = "Invalid URL."; return; }
  status.textContent = "Requesting permission…";
  chrome.permissions.request({ origins: [origin] }, function (granted) {
    if (!granted) { status.textContent = "Permission denied."; return; }
    status.textContent = "Fetching…";
    fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        if (!data || !Array.isArray(data.entries)) throw new Error("no 'entries' array");
        var patch = {}; patch[REMOTE_KEY] = { entries: data.entries };
        chrome.storage.local.set(patch, function () {
          chrome.storage.sync.set({ remoteBanlist: true, remoteBanlistUrl: url });
          document.getElementById("remoteBanlist").checked = true;
          status.textContent = "Saved " + data.entries.length + " entries ✓";
        });
      })
      .catch(function (e) { status.textContent = "Failed: " + e.message; });
  });
});

// --- Export / import learned model ---
document.getElementById("export-model").addEventListener("click", function () {
  chrome.storage.local.get([WEIGHTS_KEY], function (o) {
    var w = (o && o[WEIGHTS_KEY]) || {};
    var blob = new Blob([JSON.stringify(w, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "feedhacker-model.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
});
document.getElementById("import-model").addEventListener("click", function () { document.getElementById("import-file").click(); });
document.getElementById("import-file").addEventListener("change", function (e) {
  var status = document.getElementById("model-status");
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var w = JSON.parse(String(reader.result));
      if (!w || typeof w !== "object" || typeof w.bias !== "number") throw new Error("not a FeedHacker model");
      var patch = {}; patch[WEIGHTS_KEY] = w;
      chrome.storage.local.set(patch, function () { status.textContent = "Imported ✓"; });
    } catch (err) { status.textContent = "Invalid file: " + err.message; }
  };
  reader.readAsText(file);
});

// Live updates while the page is open.
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === "sync") chrome.storage.sync.get(DEFAULTS, renderStatus);
  if (area === "local") {
    if (changes[STATS_KEY]) renderActivity(changes[STATS_KEY].newValue);
    if (changes[Log.STORAGE_KEY]) renderErrors(changes[Log.STORAGE_KEY].newValue);
    if (changes[CUSTOM_KEY]) renderCustom(changes[CUSTOM_KEY].newValue);
    if (changes[AUTHORS_KEY]) { renderAuthors(changes[AUTHORS_KEY].newValue); renderTopSources(changes[AUTHORS_KEY].newValue); }
    if (changes[HISTORY_KEY]) renderInsights(changes[HISTORY_KEY].newValue);
  }
});

renderProps();
loadAll();
})();
