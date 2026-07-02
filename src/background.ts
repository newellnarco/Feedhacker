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

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!sender || sender.id !== chrome.runtime.id) return;   // only our own content scripts
  if (!msg) return;
  var tabId = sender.tab && sender.tab.id;

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
})();
