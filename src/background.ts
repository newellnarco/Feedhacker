// FeedHacker — background service worker. Shows a per-tab badge: the number of
// posts currently hidden, or a red "!" when the content script has logged an
// error (so a silent failure is visible). Open the popup to see the timestamped
// cause. Error state persists per tab until cleared from the popup.
(function () {
"use strict";

var errored = {};   // tabId -> true while an unacknowledged error exists

function paintCount(tabId, n) {
  try {
    if (errored[tabId]) return;   // error indicator takes precedence
    chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
    chrome.action.setBadgeText({ tabId: tabId, text: n > 0 ? String(n) : "" });
    chrome.action.setTitle({ tabId: tabId, title: "FeedHacker — " + n + " hidden on this page" });
  } catch (e) { /* action API unavailable; ignore */ }
}

function paintError(tabId, entry) {
  try {
    errored[tabId] = true;
    chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#b42318" });
    chrome.action.setBadgeText({ tabId: tabId, text: "!" });
    var when = entry && entry.iso ? entry.iso.replace("T", " ").replace(/\.\d+Z$/, "") : "";
    chrome.action.setTitle({ tabId: tabId, title: "FeedHacker error" + (when ? " at " + when : "") + " — open to view" });
  } catch (e) {}
}

// Self-update via the native-messaging helper (Windows sideload installs only): the
// helper downloads the latest release and refreshes the files on disk, then we reload
// the extension so the new version loads with no Chrome restart. Falls back cleanly
// (an error reply) when the helper isn't installed or the build lacks nativeMessaging.
function runSelfUpdate(done) {
  var replied = false;
  var reply = function (r) { if (!replied) { replied = true; try { done(r); } catch (e) {} } };
  if (!chrome.runtime.connectNative) { reply({ ok: false, error: "This build can't self-update (no native messaging)." }); return; }
  var port;
  try { port = chrome.runtime.connectNative("com.feedhacker.updater"); }
  catch (e: any) { reply({ ok: false, error: (e && e.message) || "Could not start the update helper." }); return; }
  port.onMessage.addListener(function (resp) {
    if (resp && resp.ok) {
      reply({ ok: true, updated: !!resp.updated, version: resp.version });
      // Reload after the reply reaches the options page; for an unpacked extension this
      // re-reads the refreshed files from disk — the whole point (no restart).
      if (resp.updated) setTimeout(function () { try { chrome.runtime.reload(); } catch (e) {} }, 500);
    } else {
      reply({ ok: false, error: (resp && resp.error) || "The update helper reported a failure." });
    }
    try { port.disconnect(); } catch (e) {}
  });
  port.onDisconnect.addListener(function () {
    var le = chrome.runtime.lastError;
    reply({ ok: false, error: (le && le.message) || "Update helper not found — run the Windows installer, or use installer\\update.bat." });
  });
  try { port.postMessage({ action: "update" }); }
  catch (e: any) { reply({ ok: false, error: (e && e.message) || "Could not message the update helper." }); }
}

// Chrome has downloaded a newer store version and staged it; calling chrome.runtime.reload()
// applies it with no browser restart. We record it so "Update now" can apply it instantly.
var pendingUpdate = null;   // null = none staged; string = staged version (may be "")
if (chrome.runtime.onUpdateAvailable) {
  chrome.runtime.onUpdateAvailable.addListener(function (details) {
    pendingUpdate = (details && details.version) || "";
  });
}

// Hot-apply a pending Chrome Web Store update — no browser restart. Store installs only: Chrome
// can only swap in a version that's actually PUBLISHED on the Web Store, so a version still in
// Google review isn't downloadable yet (reported back as updated:false so the UI can explain).
function runStoreUpdate(done) {
  var replied = false;
  var reply = function (r) { if (!replied) { replied = true; try { done(r); } catch (e) {} } };
  var apply = function (v) {
    reply({ ok: true, updated: true, version: v || pendingUpdate || "" });
    // Reload once the reply has reached the options page; applying a staged update swaps in the
    // new version in place, with no Chrome restart.
    setTimeout(function () { try { chrome.runtime.reload(); } catch (e) {} }, 400);
  };
  if (pendingUpdate != null) { apply(pendingUpdate); return; }   // already downloaded — apply now
  if (!chrome.runtime.requestUpdateCheck) { reply({ ok: false, error: "This Chrome build can't check for extension updates." }); return; }

  var settled = false;
  var settle = function (status, version) {
    if (settled) return; settled = true;
    if (status === "update_available") {
      if (pendingUpdate != null) return apply(version);
      // Chrome found one; give it a moment to finish staging (onUpdateAvailable), then apply.
      var fired = false;
      var go = function (v) { if (!fired) { fired = true; apply(v); } };
      try { chrome.runtime.onUpdateAvailable.addListener(function (d) { go((d && d.version) || version); }); } catch (e) {}
      setTimeout(function () { go(version); }, 2500);
    } else if (status === "throttled") {
      reply({ ok: true, updated: false, throttled: true });
    } else {
      reply({ ok: true, updated: false });   // "no_update": store hasn't published a newer version yet
    }
  };

  try {
    var ret: any = chrome.runtime.requestUpdateCheck(function (status, details) {
      var le = chrome.runtime.lastError;
      if (le) { reply({ ok: false, error: le.message }); return; }
      settle(status, details && details.version);
    });
    // MV3 promise form (if the callback isn't honored); `settled` de-dupes if both fire.
    if (ret && typeof ret.then === "function") ret.then(function (res) { settle(res && res.status, res && res.version); }, function (e) { reply({ ok: false, error: (e && e.message) || "Update check failed." }); });
  } catch (e: any) {
    reply({ ok: false, error: (e && e.message) || "Only Chrome Web Store installs can auto-update." });
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!sender || sender.id !== chrome.runtime.id) return;   // only our own content scripts
  if (!msg) return;
  var tabId = sender.tab && sender.tab.id;

  if (msg.type === "feedhacker:selfUpdate") {
    runSelfUpdate(sendResponse);
    return true;   // keep the channel open for the async native-host reply
  }

  if (msg.type === "feedhacker:storeUpdate") {
    runStoreUpdate(sendResponse);
    return true;   // keep the channel open for the async update check
  }

  if (msg.type === "feedhacker:count") {
    if (tabId == null) return;
    paintCount(tabId, msg.count | 0);
    return;
  }
  if (msg.type === "feedhacker:error") {
    if (tabId == null) return;
    paintError(tabId, msg.entry);
    return;
  }
  if (msg.type === "feedhacker:clearError") {
    // From the popup (no sender.tab): clear the badge on all tabs we flagged.
    var ids = Object.keys(errored);
    errored = {};
    for (var i = 0; i < ids.length; i++) {
      var id = Number(ids[i]);
      try { chrome.action.setBadgeText({ tabId: id, text: "" }); } catch (e) {}
    }
    return;
  }
});

chrome.tabs && chrome.tabs.onRemoved && chrome.tabs.onRemoved.addListener(function (tabId) {
  delete errored[tabId];
});

// First-run welcome: Chrome doesn't let an extension pin itself to the toolbar, so on
// a fresh install we open a one-time page that shows the user how to pin it. Fires only
// on "install" (not on updates or browser restarts), and never forces anything.
chrome.runtime.onInstalled && chrome.runtime.onInstalled.addListener(function (details) {
  if (!details || details.reason !== "install") return;
  try { chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") }); } catch (e) {}
});
})();
