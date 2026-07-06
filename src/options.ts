// FeedHacker options page — properties, activity, and diagnostics. Read-only views
// over chrome.storage plus a master enable toggle and log/learning controls.
(function () {
"use strict";
var byId = function (id) { return document.getElementById(id) as any; };
var Filters = self.FeedHackerFilters;
var Log = self.FeedHackerLog;
var Authors = self.FeedHackerAuthors;
var Update = self.FeedHackerUpdate;
var Scorer = self.FeedHackerScorer;
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
var enabledBox = byId("enabled");
var enabledState = byId("enabled-state");
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
  var active: any[] = [];
  Filters.FILTERS.forEach(function (f) {
    if (st["solo" + f.key]) active.push(f.label + " (solo)");
    else if (st["mute" + f.key]) active.push(f.label);
  });
  var extras: any[] = [];
  if (st.aggressive) extras.push("aggressive slop");
  if (st.hideSlopComments) extras.push("hide slop comments");
  if (st.hideCompletely) extras.push("hide completely");
  if (st.nameSample) extras.push("name + sample + category");
  else if (st.nameNames) extras.push("name names");
  var el = byId("active-summary");
  el.textContent = "Active filters: " + (active.length ? active.join(", ") : "none") +
    (extras.length ? " · Options: " + extras.join(", ") : "");

  byId("scanEverywhere").checked = !!st.scanEverywhere;
  byId("implicitLearning").checked = !!st.implicitLearning;
  byId("remoteBanlist").checked = !!st.remoteBanlist;

  var thr = byId("slop-threshold");
  if (thr) thr.textContent = String(typeof st.slopThreshold === "number" ? st.slopThreshold : 0.5);
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
  var dl = byId("props");
  dl.innerHTML = "";
  rows.forEach(function (r) {
    var dt = document.createElement("dt"); dt.textContent = r[0];
    var dd = document.createElement("dd"); dd.textContent = r[1];
    dl.appendChild(dt); dl.appendChild(dd);
  });
}

// --- Activity from the last scan snapshot ---
function renderActivity(stats) {
  var box = byId("activity");
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
    (tr.firstChild as any).textContent = name;
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  box.appendChild(table);
}

// --- Error log ---
function renderErrors(list) {
  list = list || [];
  var ul = byId("errs");
  var empty = byId("errs-empty");
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
  chrome.storage.local.get([STATS_KEY, Log.STORAGE_KEY, CUSTOM_KEY, AUTHORS_KEY, HISTORY_KEY, WEIGHTS_KEY], function (o) {
    renderActivity(o && o[STATS_KEY]);
    renderErrors(o && o[Log.STORAGE_KEY]);
    renderCustom(o && o[CUSTOM_KEY]);
    renderAuthors(o && o[AUTHORS_KEY]);
    renderInsights(o && o[HISTORY_KEY]);
    renderTopSources(o && o[AUTHORS_KEY]);
    renderSlopSignals(o && o[WEIGHTS_KEY]);
  });
}

byId("clear-errors").addEventListener("click", function () {
  var patch = {}; patch[Log.STORAGE_KEY] = [];
  chrome.storage.local.set(patch, function () {
    renderErrors([]);
    try { chrome.runtime.sendMessage({ type: "feedhacker:clearError" }); } catch (e) {}
  });
});
byId("reset-learning").addEventListener("click", function () {
  chrome.storage.local.remove(WEIGHTS_KEY, function () {
    var b = byId("reset-learning");
    b.textContent = "Learning reset ✓";
    setTimeout(function () { b.textContent = "Reset AI-slop learning"; }, 1600);
  });
});
byId("refresh").addEventListener("click", loadAll);

// --- update check: compare the running version against the latest GitHub release ---
function currentVersion() { try { return chrome.runtime.getManifest().version; } catch (e) { return ""; } }
(function initUpdates() {
  var cur = byId("update-current");
  if (cur) cur.textContent = currentVersion();
  var btn = byId("check-updates"), status = byId("update-status");
  if (!btn || !status || !Update) return;
  btn.addEventListener("click", function () {
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = "Checking…";
    Update.checkForUpdate(null, currentVersion()).then(function (res) {
      status.textContent = res.updateAvailable
        ? "Update available: v" + res.current + " → v" + res.latest +
          ". Chrome Web Store installs update themselves. Windows installs: the daily auto‑update task " +
          "fetches it — restart Chrome (or run installer\\update.bat) to apply. Manual Load‑unpacked installs: " +
          "download the latest release and reload FeedHacker on chrome://extensions."
        : "You're on the latest version (v" + res.current + ").";
    }).catch(function (e) {
      status.textContent = "Couldn't check for updates: " + ((e && e.message) || e);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  });
})();

// --- Insights (daily history + top sources) ---
function renderInsights(history) {
  var box = byId("insights");
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
// A source's key is the LinkedIn profile/company path (e.g. "/in/jane-doe"), so we
// can link straight to the profile — from there LinkedIn's own menu lets you block,
// mute, or report. Name-only keys have no URL, so no link is shown for those.
function profileUrl(key) {
  return (key && /^\/(?:in|company|school)\//.test(key)) ? "https://www.linkedin.com" + key : "";
}
function renderTopSources(store) {
  var box = byId("top-sources");
  box.innerHTML = "";
  var top = Authors ? Authors.topSources(store, 8).filter(function (a) { return a.hidden > 0; }) : [];
  if (!top.length) { box.innerHTML = "<p class='empty'>No author data yet.</p>"; return; }
  var table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Author</th><th class='num'>Hidden</th><th class='num'>Shown</th></tr></thead>";
  var tb = document.createElement("tbody");
  top.forEach(function (a) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td class='num'>" + a.hidden + "</td><td class='num'>" + a.shown + "</td>";
    var nameCell = tr.firstChild as any;
    var span = document.createElement("span");
    span.textContent = a.name || a.key;
    nameCell.appendChild(span);
    var url = profileUrl(a.key);
    if (url) {
      var link = document.createElement("a");
      link.href = url; link.target = "_blank"; link.rel = "noopener";
      link.textContent = "profile ↗";
      link.title = "Open profile on LinkedIn — block, mute, or report from there";
      link.style.marginLeft = "8px"; link.style.fontSize = "12px";
      nameCell.appendChild(link);
    }
    tb.appendChild(tr);
  });
  table.appendChild(tb); box.appendChild(table);
}

// --- How AI-slop detection works: signals table + curated phrase list ---
// Plain-English descriptions for each scoring feature. Keyed by the scorer's
// FEATURE_IDS so the table stays in sync if a tell is added/removed there.
var SIGNAL_DESC = {
  banlist: "Curated words and phrases that read as AI‑written (listed below).",
  emdash: "Heavy use of em dashes (—).",
  antithesis: "“Not X, but Y” framing — “it’s not about the tool, it’s about the mindset.”",
  ruleofthree: "Three‑part lists and staccato triples — “A, B, and C” / “Ship. Learn. Repeat.”",
  rhetorical: "Rhetorical setups — “The result?”, “The takeaway?”, “The best part?”",
  emoji: "Emoji packed into the text.",
  bullets: "Emoji / dash / number bullet lines — the listicle shape.",
  connectives: "Formal signposting — moreover, furthermore, therefore, ultimately…",
  openers: "Formula openers — “Let’s be honest”, “Hot take”, “Plot twist”.",
  broetry: "One thought per line with lots of short standalone lines (LinkedIn “broetry”).",
  uniformity: "Unnaturally even sentence lengths."
};

function renderSlopSignals(stored) {
  var tb = byId("slop-signals");
  if (!Scorer || !tb) return;
  var w = Scorer.defaultWeights();
  if (stored) for (var k in stored) if (typeof stored[k] === "number") w[k] = stored[k];
  var ids = Scorer.FEATURE_IDS;
  var max = 0;
  ids.forEach(function (id) { if (typeof w[id] === "number" && w[id] > max) max = w[id]; });
  tb.innerHTML = "";
  ids.forEach(function (id) {
    var wt = typeof w[id] === "number" ? w[id] : 0;
    var pct = max > 0 ? Math.round(Math.max(0, wt) / max * 100) : 0;
    var tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td class='muted'></td>" +
      "<td class='num'><span class='wnum'></span>" +
      "<span class='wtrack'><span class='wbar' style='width:" + pct + "%'></span></span></td>";
    (tr.children[0] as any).textContent = (Scorer.FEATURE_LABELS[id] || id);
    (tr.children[1] as any).textContent = SIGNAL_DESC[id] || "";
    (tr.querySelector(".wnum") as any).textContent = wt.toFixed(1);
    tb.appendChild(tr);
  });
  var note = byId("slop-model-note");
  if (note) note.textContent = "Model bias " + (typeof w.bias === "number" ? w.bias : -1.6).toFixed(1) +
    ". A higher weight means that signal pushes harder toward hiding; evidence has to add up past the threshold before a post is hidden.";
}

// The curated banlist is loaded once (from the bundled claudisms.json, plus the
// opt-in remote entries when that setting is on) and cached for live filtering.
var slopEntries: any[] = [];
function mergeEntries(base, extra) {
  var seen = {}; var out: any[] = [];
  base.concat(extra).forEach(function (e) {
    if (!e || !e.id || seen[e.id]) return;
    seen[e.id] = 1; out.push(e);
  });
  return out;
}
function loadSlopPhrases() {
  var box = byId("slop-phrase-list");
  if (!box) return;
  fetch(chrome.runtime.getURL("claudisms.json"))
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      var entries = (data && Array.isArray(data.entries)) ? data.entries.slice() : [];
      chrome.storage.sync.get({ remoteBanlist: false }, function (s) {
        if (s.remoteBanlist) {
          chrome.storage.local.get([REMOTE_KEY], function (o) {
            var rem = o && o[REMOTE_KEY];
            slopEntries = (rem && Array.isArray(rem.entries)) ? mergeEntries(entries, rem.entries) : entries;
            renderPhrases();
          });
        } else { slopEntries = entries; renderPhrases(); }
      });
    })
    .catch(function (e) { box.innerHTML = "<li class='empty'>Couldn't load the phrase list: " + e.message + "</li>"; });
}
var CAT_ORDER = ["confirmed", "aggressive", "manual"];
function phraseWords(e) {
  if (e.matchType === "literal" && Array.isArray(e.match)) return e.match.slice();
  return [];
}
function phraseTitle(e, words) {
  if (words.length) return words.join(", ");
  if (e.matchType === "regex" && e.pattern) return e.note || ("pattern: " + e.pattern);
  return e.note || e.id;
}
function renderPhrases() {
  var box = byId("slop-phrase-list");
  var countEl = byId("slop-phrase-count");
  if (!box) return;
  var q = String((byId("slop-phrase-search") as any).value || "").trim().toLowerCase();
  var matched = slopEntries.filter(function (e) {
    if (!q) return true;
    var words = phraseWords(e);
    var hay = [e.id, e.category, e.note, e.replacement, e.pattern, words.join(" ")]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  });
  if (countEl) countEl.textContent = "(" + matched.length +
    (q ? " of " + slopEntries.length : "") + ")";
  box.innerHTML = "";
  if (!matched.length) { box.innerHTML = "<li class='empty'>No phrases match “" + q + "”.</li>"; return; }
  // Group by category, confirmed first.
  var groups: any = {};
  matched.forEach(function (e) { var c = e.category || "other"; (groups[c] = groups[c] || []).push(e); });
  var cats = Object.keys(groups).sort(function (a, b) {
    var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  cats.forEach(function (cat) {
    groups[cat].forEach(function (e) {
      var words = phraseWords(e);
      var li = document.createElement("li");
      var t = document.createElement("div"); t.className = "pwords"; t.textContent = phraseTitle(e, words);
      li.appendChild(t);
      if (e.note && words.length) {
        var n = document.createElement("div"); n.className = "pnote"; n.textContent = e.note; li.appendChild(n);
      }
      var meta = document.createElement("div"); meta.className = "pmeta";
      var badge = document.createElement("span");
      badge.className = "badge " + (CAT_ORDER.indexOf(cat) >= 0 ? cat : "manual");
      badge.textContent = cat;
      meta.appendChild(badge);
      if (e.replacement) {
        var rep = document.createElement("span"); rep.className = "prep";
        rep.textContent = "→ " + e.replacement; meta.appendChild(rep);
      }
      li.appendChild(meta);
      box.appendChild(li);
    });
  });
}

// --- Custom filters ---
function linesToArr(v) { return String(v || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }
function renderCustom(c) {
  c = c || {};
  byId("cf-words").value = (c.words || []).join("\n");
  byId("cf-regexes").value = (c.regexes || []).join("\n");
  byId("cf-hashtags").value = (c.hashtags || []).join("\n");
  byId("cf-companies").value = (c.companies || []).join("\n");
}
byId("cf-save").addEventListener("click", function () {
  var c = {
    words: linesToArr(byId("cf-words").value),
    regexes: linesToArr(byId("cf-regexes").value),
    hashtags: linesToArr(byId("cf-hashtags").value),
    companies: linesToArr(byId("cf-companies").value)
  };
  var patch = {}; patch[CUSTOM_KEY] = c;
  chrome.storage.local.set(patch, function () {
    var s = byId("cf-status"); s.textContent = "Saved ✓";
    setTimeout(function () { s.textContent = ""; }, 1500);
  });
});

// --- Authors (muted / allowed chips) ---
function renderAuthors(store) {
  store = Authors ? Authors.ensure(store) : (store || { muted: {}, allowed: {}, scores: {} });
  function nameOf(key) { return (store.scores[key] && store.scores[key].name) || key; }
  function fill(id, keys, remove) {
    var ul = byId(id); ul.innerHTML = "";
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
  var el = byId(id);
  el.addEventListener("change", function () { var p = {}; p[id] = el.checked; chrome.storage.sync.set(p); });
});
// The curated banlist is fetched from a single fixed host we control (narrow, easy to
// justify for the Web Store) and the entries are stored ONLY in chrome.storage.local —
// on this user's machine, never synced or sent anywhere.
var BANLIST_URL = "https://raw.githubusercontent.com/newellnarco/Feedhacker/main/claudisms.json";
var BANLIST_ORIGIN = "https://raw.githubusercontent.com/newellnarco/Feedhacker/*";

byId("remote-fetch").addEventListener("click", function () {
  var status = byId("remote-status");
  status.textContent = "Requesting permission…";
  chrome.permissions.request({ origins: [BANLIST_ORIGIN] }, function (granted) {
    if (!granted) { status.textContent = "Permission denied."; return; }
    status.textContent = "Updating…";
    fetch(BANLIST_URL).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        if (!data || !Array.isArray(data.entries)) throw new Error("no 'entries' array");
        var patch = {}; patch[REMOTE_KEY] = { entries: data.entries };
        chrome.storage.local.set(patch, function () {   // device-local, this user only
          chrome.storage.sync.set({ remoteBanlist: true });
          byId("remoteBanlist").checked = true;
          status.textContent = "Updated — " + data.entries.length + " entries stored locally ✓";
        });
      })
      .catch(function (e) { status.textContent = "Failed: " + e.message; });
  });
});

// --- Export / import learned model ---
byId("export-model").addEventListener("click", function () {
  chrome.storage.local.get([WEIGHTS_KEY], function (o) {
    var w = (o && o[WEIGHTS_KEY]) || {};
    var blob = new Blob([JSON.stringify(w, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "feedhacker-model.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
});
byId("import-model").addEventListener("click", function () { byId("import-file").click(); });
byId("import-file").addEventListener("change", function (e) {
  var status = byId("model-status");
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var w = JSON.parse(String(reader.result));
      if (!w || typeof w !== "object" || typeof w.bias !== "number") throw new Error("not a FeedHacker model");
      var patch = {}; patch[WEIGHTS_KEY] = w;
      chrome.storage.local.set(patch, function () { status.textContent = "Imported ✓"; });
    } catch (err: any) { status.textContent = "Invalid file: " + err.message; }
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
    if (changes[WEIGHTS_KEY]) renderSlopSignals(changes[WEIGHTS_KEY].newValue);
    if (changes[REMOTE_KEY]) loadSlopPhrases();
  }
});

// Live-filter the curated phrase list as you type.
(function () {
  var input = byId("slop-phrase-search");
  if (input) input.addEventListener("input", renderPhrases);
})();

renderProps();
loadAll();
loadSlopPhrases();
})();
