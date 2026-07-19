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
var SlopLog = self.FeedHackerSlopLog;
var DEFAULTS = Filters.DEFAULTS;
var WEIGHTS_KEY = "feedhacker:slopWeights";
var STATS_KEY = "feedhacker:stats";
var CUSTOM_KEY = "feedhacker:custom";
var AUTHORS_KEY = "feedhacker:authors";
var HISTORY_KEY = "feedhacker:history";
var SLOPLOG_KEY = SlopLog ? SlopLog.STORAGE_KEY : "feedhacker:sloplog";
var TRAIN_KEY = "feedhacker:sloptrain";
var OBS_KEY = "feedhacker:slopobs";
var CAL_KEY = "feedhacker:slopcal";

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
  if (st.hideSlopComments) extras.push("hide slop comments");
  if (st.hideCompletely) extras.push("hide completely");
  if (st.nameNames && st.nameSample) extras.push("author + sample");
  else if (st.nameNames) extras.push("author");
  else if (st.nameSample) extras.push("sample");
  var el = byId("active-summary");
  el.textContent = "Active filters: " + (active.length ? active.join(", ") : "none") +
    (extras.length ? " · Options: " + extras.join(", ") : "");

  byId("autoCalibrate").checked = st.autoCalibrate !== false;   // default on
  byId("groupHiddenRuns").checked = st.groupHiddenRuns !== false;   // default on
  byId("scanEverywhere").checked = !!st.scanEverywhere;
  byId("implicitLearning").checked = !!st.implicitLearning;

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

// AI-slop decision log: a summary line + the most recent decisions with their "why".
function renderSlopLog(list) {
  list = list || [];
  var sum = SlopLog ? SlopLog.summarize(list) : { total: list.length, falsePositives: 0, confirmed: 0, unlabeled: list.length };
  var summary = byId("slop-log-summary");
  if (summary) {
    summary.textContent = sum.total
      ? sum.total + " flagged · " + sum.falsePositives + " you marked not‑slop · " + sum.confirmed + " confirmed · " + sum.unlabeled + " no verdict yet"
      : "No decisions logged yet.";
  }
  var ul = byId("slop-log-list");
  if (!ul) return;
  ul.innerHTML = "";
  for (var i = list.length - 1, shown = 0; i >= 0 && shown < 12; i--, shown++) {
    var e = list[i]; if (!e) { shown--; continue; }
    var li = document.createElement("li");
    li.style.cssText = "display:block; padding:8px 10px; background:#f7f8fa; border-radius:8px;";
    var verdict = e.label === 0 ? "✗ not slop" : e.label === 1 ? "✓ confirmed" : "· no verdict";
    var head = document.createElement("div");
    head.style.cssText = "font-size:12px; color:#5f6b7a;";
    head.textContent = fmtWhen(e.ts) + " · p=" + (e.prob != null ? e.prob : "?") + " · " + verdict + (e.surface === "comment" ? " · comment" : "");
    var body = document.createElement("div");
    body.style.cssText = "font-size:13px; color:#1d2226; margin:2px 0;";
    body.textContent = (e.author ? e.author + ": " : "") + (e.preview || "");
    var why = document.createElement("div");
    why.style.cssText = "font-size:12px; color:#6a7686;";
    var tells = (e.top || []).slice(0, 4).map(function (c) { return c.label + " (" + c.contribution + ")"; }).join(", ");
    var phr = (e.phrases || []).length ? " · phrases: " + e.phrases.slice(0, 4).join(", ") : "";
    why.textContent = "tells: " + (tells || "—") + phr;
    li.appendChild(head); li.appendChild(body); li.appendChild(why);
    ul.appendChild(li);
  }
}

// Autonomous auto-calibration status: what the model tuned itself to, on its own.
function renderCal(cal) {
  var el = byId("slop-cal-status");
  if (!el) return;
  if (!cal || !cal.at) { el.textContent = "Auto-calibration is on — it will tune the model once it has reviewed enough posts."; return; }
  var pct = Math.round((cal.flaggedFrac || 0) * 100);
  el.textContent = "Self-tuned " + fmtWhen(cal.at) + ": hiding ~" + pct + "% of reviewed posts (threshold " +
    (Math.round((cal.threshold || 0) * 100) / 100) + ", from " + (cal.n || 0) + " posts reviewed).";
}

function loadAll() {
  chrome.storage.sync.get(DEFAULTS, renderStatus);
  chrome.storage.local.get([STATS_KEY, Log.STORAGE_KEY, CUSTOM_KEY, AUTHORS_KEY, HISTORY_KEY, WEIGHTS_KEY, SLOPLOG_KEY, CAL_KEY], function (o) {
    renderActivity(o && o[STATS_KEY]);
    renderErrors(o && o[Log.STORAGE_KEY]);
    renderCustom(o && o[CUSTOM_KEY]);
    renderAuthors(o && o[AUTHORS_KEY]);
    renderInsights(o && o[HISTORY_KEY]);
    renderTopSources(o && o[AUTHORS_KEY]);
    renderSlopSignals(o && o[WEIGHTS_KEY]);
    renderSlopLog(o && o[SLOPLOG_KEY]);
    renderCal(o && o[CAL_KEY]);
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

// --- AI-slop decision log: export / clear / recalibrate ---
function slopStatus(msg) {
  var s = byId("slop-log-status"); if (!s) return;
  s.textContent = msg; setTimeout(function () { s.textContent = ""; }, 2200);
}
byId("slop-log-export").addEventListener("click", function () {
  chrome.storage.sync.get(DEFAULTS, function (st) {
    chrome.storage.local.get([SLOPLOG_KEY, TRAIN_KEY, WEIGHTS_KEY, OBS_KEY, CAL_KEY], function (o) {
      try {
        var log = (o && o[SLOPLOG_KEY]) || [];
        var payload = {
          app: "feedhacker",
          kind: "slop-decision-log",
          version: currentVersion(),
          exportedAt: new Date().toISOString(),
          threshold: (st && typeof st.slopThreshold === "number") ? st.slopThreshold : (Scorer ? Scorer.THRESHOLD : 0.5),
          weights: (o && o[WEIGHTS_KEY]) || (Scorer ? Scorer.defaultWeights() : {}),
          summary: SlopLog ? SlopLog.summarize(log) : null,
          calibration: (o && o[CAL_KEY]) || null,
          log: log,
          training: (o && o[TRAIN_KEY]) || [],
          observations: (o && o[OBS_KEY]) || []
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "feedhacker-slop-log.json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        slopStatus("Exported " + payload.log.length + " decisions.");
      } catch (e) { slopStatus("Export failed."); }
    });
  });
});
byId("slop-log-clear").addEventListener("click", function () {
  // Clears the human-readable log only; the labeled training data that tunes the model is
  // kept (use "Reset AI-slop learning" in the Error log panel to wipe the model itself).
  var patch = {}; patch[SLOPLOG_KEY] = [];
  chrome.storage.local.set(patch, function () { renderSlopLog([]); slopStatus("Log cleared (model kept)."); });
});
byId("slop-recalibrate").addEventListener("click", function () {
  if (!Scorer || !Scorer.liveCalibrate) { slopStatus("Scorer unavailable."); return; }
  chrome.storage.sync.get(DEFAULTS, function (st) {
    chrome.storage.local.get([OBS_KEY, TRAIN_KEY, WEIGHTS_KEY], function (o) {
      var obs = (o && o[OBS_KEY]) || [];
      if (obs.length < 30) { slopStatus("Reviewing posts — need ~30 (have " + obs.length + "). Scroll your feed, then retry."); return; }
      try {
        var r = Scorer.liveCalibrate({
          current: (o && o[WEIGHTS_KEY]) || null,     // evolve from the latest running model
          currentThreshold: typeof st.slopThreshold === "number" ? st.slopThreshold : 0.5,
          defaults: Scorer.defaultWeights(),
          observations: obs,
          labels: (o && o[TRAIN_KEY]) || [],
          targetFrac: typeof st.slopTargetFrac === "number" ? st.slopTargetFrac : 0.28,
          alpha: 0.6
        });
        if (!r || !r.calibrated) { slopStatus("Not enough data to calibrate yet."); return; }
        var patch = {};   // one local write (weights + status together)
        patch[WEIGHTS_KEY] = r.weights;
        // Manual recalibrate keeps the full observation buffer (no reap), so nKept == n here.
        patch[CAL_KEY] = { at: Date.now(), threshold: r.threshold, flaggedFrac: r.flaggedFrac, freqs: r.freqs, n: obs.length, nKept: obs.length, labels: r.labelsUsed };
        chrome.storage.local.set(patch, function () { renderSlopSignals(r.weights); renderCal(patch[CAL_KEY]); });
        try { chrome.storage.sync.set({ slopThreshold: r.threshold }); } catch (e) {}
        slopStatus("Self-tuned from " + obs.length + " reviewed posts" + (r.labelsUsed ? " + " + r.labelsUsed + " of your corrections" : "") + " — now hiding ~" + Math.round(r.flaggedFrac * 100) + "%.");
      } catch (e) { slopStatus("Calibration failed."); }
    });
  });
});

// --- update check: compare the running version against the latest GitHub release ---
function currentVersion() { try { return chrome.runtime.getManifest().version; } catch (e) { return ""; } }
(function initUpdates() {
  var cur = byId("update-current");
  if (cur) cur.textContent = currentVersion();
  var btn = byId("check-updates"), status = byId("update-status"), now = byId("update-now");
  if (!btn || !status || !Update) return;

  // "Update now" (download + apply with no restart) only works on the Windows sideload
  // build, which alone carries the nativeMessaging permission + the local update helper.
  var canSelfUpdate = false;
  try { canSelfUpdate = (chrome.runtime.getManifest().permissions || []).indexOf("nativeMessaging") >= 0; } catch (e) {}
  function showNow(show) { if (now) now.style.display = show ? "" : "none"; }
  showNow(false);

  btn.addEventListener("click", function () {
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = "Checking…";
    showNow(false);
    Update.checkForUpdate(null, currentVersion()).then(function (res) {
      if (!res.updateAvailable) {
        status.textContent = "You're on the latest version (v" + res.current + ").";
        return;
      }
      status.textContent = "Update available: v" + res.current + " → v" + res.latest + ". ";
      // Both builds now get an in-place "Update now": Windows via the helper, a Chrome Web Store
      // install via Chrome's own update API — either way, no browser restart.
      status.textContent += "Click “Update now” to apply it in place — no browser restart.";
      showNow(true);
    }).catch(function (e) {
      status.textContent = "Couldn't check for updates: " + ((e && e.message) || e);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  });

  function resetNow(lbl) { showNow(true); now.disabled = false; now.textContent = lbl; }

  // Windows sideload: the native-messaging helper downloads the release, refreshes the files, and
  // reloads the extension — no restart.
  function windowsUpdate(lbl) {
    status.textContent = "Downloading the latest release…";
    chrome.runtime.sendMessage({ type: "feedhacker:selfUpdate" }, function (res) {
      var le = chrome.runtime.lastError;
      if (le || !res) {
        status.textContent = "Update failed: " + ((le && le.message) || "no response from the update helper.");
        resetNow(lbl); return;
      }
      if (res.ok && res.updated) {
        status.textContent = "Updated to v" + res.version + " — reloading FeedHacker…";
        // The extension reloads itself; this page will show the new version on refresh.
      } else if (res.ok) {
        status.textContent = "Already on the latest version (v" + res.version + ").";
        showNow(false); now.disabled = false; now.textContent = lbl;
      } else {
        status.textContent = "Update failed: " + (res.error || "unknown error");
        resetNow(lbl);
      }
    });
  }

  // Chrome Web Store: ask Chrome to fetch + apply the published update in place (no restart). Chrome
  // can only apply a version that's actually LIVE on the store, so if ours is still in Google review
  // there's nothing to apply yet — say so instead of pretending it worked.
  function storeUpdate(lbl) {
    status.textContent = "Checking the Chrome Web Store…";
    chrome.runtime.sendMessage({ type: "feedhacker:storeUpdate" }, function (res) {
      var le = chrome.runtime.lastError;
      if (le || !res) {
        status.textContent = "Couldn't update in place: " + ((le && le.message) || "no response.") +
          " You can install the latest from GitHub Releases, or restart Chrome to apply a pending update.";
        resetNow(lbl); return;
      }
      if (res.ok && res.updated) {
        status.textContent = "Update found — applying now, no browser restart. When FeedHacker reloads, " +
          "refresh your LinkedIn tab to resume filtering.";
        // The extension reloads itself momentarily; this page shows the new version on refresh.
      } else if (res.ok && res.throttled) {
        status.textContent = "Chrome is rate-limiting update checks right now. Try again in a few minutes, " +
          "or restart Chrome to apply a pending update.";
        resetNow(lbl);
      } else if (res.ok) {
        // no_update: the newer version isn't published on the store yet (Google review lag).
        status.textContent = "The new version isn’t on the Chrome Web Store yet (Google is still reviewing it), " +
          "so Chrome has nothing to apply. It’ll hot-update automatically once approved — or install the latest " +
          "now from GitHub Releases.";
        resetNow(lbl);
      } else {
        status.textContent = "Couldn’t update in place: " + (res.error || "unknown error") +
          " You can install the latest from GitHub Releases, or restart Chrome.";
        resetNow(lbl);
      }
    });
  }

  if (now) now.addEventListener("click", function () {
    now.disabled = true;
    var lbl = now.textContent;
    now.textContent = "Updating…";
    if (canSelfUpdate) windowsUpdate(lbl); else storeUpdate(lbl);
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
    (tr.querySelector(".wnum") as any).textContent = wt.toFixed(2);
    tb.appendChild(tr);
  });
  var note = byId("slop-model-note");
  if (note) note.textContent = "Model bias " + (typeof w.bias === "number" ? w.bias : -1.6).toFixed(2) +
    ". A higher weight means that signal pushes harder toward hiding; evidence has to add up past the threshold before a post is hidden.";
}

// The curated banlist (bundled claudisms.json) is loaded once and cached for live filtering.
var slopEntries: any[] = [];
function loadSlopPhrases() {
  var box = byId("slop-phrase-list");
  if (!box) return;
  fetch(chrome.runtime.getURL("claudisms.json"))
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      slopEntries = (data && Array.isArray(data.entries)) ? data.entries.slice() : [];
      renderPhrases();
    })
    .catch(function (e) {
      box.innerHTML = "";
      var li = document.createElement("li"); li.className = "empty";
      li.textContent = "Couldn't load the phrase list: " + ((e && e.message) || e);
      box.appendChild(li);
    });
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
  if (!matched.length) {
    var none = document.createElement("li");
    none.className = "empty";
    none.textContent = "No phrases match “" + q + "”.";   // textContent: never treat the query as HTML
    box.appendChild(none);
    return;
  }
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
["autoCalibrate", "groupHiddenRuns", "scanEverywhere", "implicitLearning"].forEach(function (id) {
  var el = byId(id);
  el.addEventListener("change", function () { var p = {}; p[id] = el.checked; chrome.storage.sync.set(p); });
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
    if (changes[SLOPLOG_KEY]) renderSlopLog(changes[SLOPLOG_KEY].newValue);
    if (changes[CAL_KEY]) renderCal(changes[CAL_KEY].newValue);
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
