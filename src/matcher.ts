// FeedHacker matcher — pure, testable string/regex matching against the banlist.
(function (root) {
  "use strict";

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function buildMatchers(data) {
    var out: any[] = [];
    var entries = (data && data.entries) || [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || e.matchType === "manual") continue;
      var re: any = null;
      if (e.matchType === "regex" && e.pattern) {
        try { re = new RegExp(e.pattern, "iu"); }
        catch (a) { try { re = new RegExp(e.pattern, "i"); } catch (b) { re = null; } }
      } else if (e.matchType === "literal" && Array.isArray(e.match) && e.match.length) {
        var alts = e.match.map(function (m) {
          return "(?<![a-z0-9])" + escapeRe(String(m)) + "(?![a-z0-9])";
        });
        try { re = new RegExp(alts.join("|"), "i"); } catch (c) { re = null; }
      }
      if (re) {
        var m: any = { id: e.id, aggressive: !!e.aggressive, category: e.category || "", re: re };
        if (e.minCount && e.matchType === "regex" && e.pattern) {
          m.minCount = e.minCount;
          try { m.reCount = new RegExp(e.pattern, "giu"); }
          catch (g1) { try { m.reCount = new RegExp(e.pattern, "gi"); } catch (g2) { m.reCount = null; } }
        }
        out.push(m);
      }
    }
    return out;
  }

  function findHits(matchers, text) {
    var hits: any[] = [];
    if (!text) return hits;
    for (var i = 0; i < matchers.length; i++) {
      var m = matchers[i];
      if (m.minCount) {
        if (m.reCount && (text.match(m.reCount) || []).length >= m.minCount) hits.push(m.id);
        continue;
      }
      m.re.lastIndex = 0;
      if (m.re.test(text)) hits.push(m.id);
    }
    return hits;
  }

  // Like findHits, but returns [{id, text}] with the actual matched substring,
  // used to explain to the user WHY a post was flagged.
  function findHitDetails(matchers, text) {
    var out: any[] = [];
    if (!text) return out;
    for (var i = 0; i < matchers.length; i++) {
      var m = matchers[i];
      if (m.minCount) {
        var cnt = m.reCount ? (text.match(m.reCount) || []).length : 0;
        if (cnt >= m.minCount) out.push({ id: m.id, text: String(cnt), category: m.category, aggressive: m.aggressive });
        continue;
      }
      m.re.lastIndex = 0;
      var mm = m.re.exec(text);
      if (mm) out.push({ id: m.id, text: mm[0], category: m.category, aggressive: m.aggressive });
    }
    return out;
  }

  var api = { escapeRe: escapeRe, buildMatchers: buildMatchers, findHits: findHits, findHitDetails: findHitDetails };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerMatcher = api;
})(typeof self !== "undefined" ? self : this);
