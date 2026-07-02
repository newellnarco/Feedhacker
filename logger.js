// FeedHacker — error log. Pure, testable helpers for building and capping a ring
// buffer of timestamped error entries. The glue layer (content.js / background.js)
// persists the buffer to chrome.storage.local under STORAGE_KEY and the popup reads
// it back to show "FeedHacker errored" with the date-time-stamped cause line.
(function (root) {
  "use strict";

  var STORAGE_KEY = "feedhacker:errorlog";
  var MAX = 50;   // keep the last N errors; oldest drop off

  // Pull the first meaningful "file:line:col" frame out of an Error stack, so the
  // popup can show WHERE it failed, not just the message.
  function sourceFromStack(stack) {
    if (!stack) return "";
    var lines = String(stack).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/([\w.\-]+\.js:\d+:\d+)/) || lines[i].match(/([\w.\-]+\.js:\d+)/);
      if (m) return m[1];
    }
    return "";
  }

  // Build one entry. nowMs is injected (Date.now() in the app) so this stays pure
  // and unit-testable. context is a short tag for WHERE in our code it happened.
  function makeEntry(err, context, nowMs) {
    var msg, stack;
    if (err && typeof err === "object") { msg = err.message || String(err); stack = err.stack; }
    else { msg = String(err); stack = ""; }
    var ts = typeof nowMs === "number" ? nowMs : 0;
    return {
      ts: ts,
      iso: ts ? new Date(ts).toISOString() : "",
      context: context || "",
      msg: msg,
      source: sourceFromStack(stack)
    };
  }

  // Append with cap. Returns a NEW array (does not mutate input).
  function push(list, entry, max) {
    var cap = typeof max === "number" ? max : MAX;
    var out = (list || []).concat([entry]);
    if (out.length > cap) out = out.slice(out.length - cap);
    return out;
  }

  // Human line for the popup: "2026-07-02 14:03:11 — banlist-fetch: Failed to fetch (content.js:145)".
  function format(entry) {
    if (!entry) return "";
    var when = entry.iso ? entry.iso.replace("T", " ").replace(/\.\d+Z$/, "") : "?";
    var where = entry.source ? " (" + entry.source + ")" : "";
    var ctx = entry.context ? entry.context + ": " : "";
    return when + " — " + ctx + entry.msg + where;
  }

  var api = { STORAGE_KEY: STORAGE_KEY, MAX: MAX, sourceFromStack: sourceFromStack, makeEntry: makeEntry, push: push, format: format };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerLog = api;
})(typeof self !== "undefined" ? self : this);
