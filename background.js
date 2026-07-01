// FeedHacker — background service worker. Shows a per-tab badge with the number
// of posts currently hidden, so it is obvious the extension is alive and working.
"use strict";
chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!sender || sender.id !== chrome.runtime.id) return;   // only our own content scripts
  if (!msg || msg.type !== "feedhacker:count") return;
  var tabId = sender.tab && sender.tab.id;
  if (tabId == null) return;
  var n = msg.count | 0;
  try {
    chrome.action.setBadgeBackgroundColor({ color: "#0a66c2" });
    chrome.action.setBadgeText({ tabId: tabId, text: n > 0 ? String(n) : "" });
    chrome.action.setTitle({ tabId: tabId, title: "FeedHacker — " + n + " hidden on this page" });
  } catch (e) { /* action API unavailable; ignore */ }
});
