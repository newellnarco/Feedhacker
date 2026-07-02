// FeedHacker — user-defined filters. Pure, testable (no chrome.*). Compiles a
// user's custom lists (plain words, regexes, hashtags, companies/authors) into
// matchers and tests post text/author against them. Stored by the glue layer in
// chrome.storage.local under "feedhacker:custom".
(function (root) {
  "use strict";

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function clean(list) { return arr(list).map(String).map(function (s) { return s.trim(); }).filter(Boolean); }

  // custom: { words:[], regexes:[], hashtags:[], companies:[] }
  function compile(custom) {
    custom = custom || {};
    var words = clean(custom.words);
    var wordRe = words.length
      ? safeRe(words.map(function (w) { return "(?<![a-z0-9])" + esc(w) + "(?![a-z0-9])"; }).join("|"))
      : null;

    var regexList = [];
    clean(custom.regexes).forEach(function (src) {
      var re = safeRe(src);
      if (re) regexList.push({ src: src, re: re });
    });

    var tags = clean(custom.hashtags).map(function (t) { return t.replace(/^#/, "").toLowerCase(); }).filter(Boolean);
    var hashtagRe = tags.length ? safeRe(tags.map(function (t) { return "#" + esc(t) + "\\b"; }).join("|")) : null;

    var companies = clean(custom.companies);
    return { wordRe: wordRe, regexList: regexList, hashtagRe: hashtagRe, companies: companies, words: words, tags: tags };
  }
  function safeRe(src) { try { return new RegExp(src, "i"); } catch (e) { return null; } }

  function anyConfigured(compiled) {
    return !!(compiled && (compiled.wordRe || compiled.regexList.length || compiled.hashtagRe || compiled.companies.length));
  }

  // Returns flags [{type, value}] for each custom rule that matched. info is the
  // author {name, url} so company/author rules can match the poster, not just text.
  function match(text, info, compiled) {
    var flags = [];
    text = text || "";
    if (!compiled) return flags;
    if (compiled.wordRe) { compiled.wordRe.lastIndex = 0; var m = compiled.wordRe.exec(text); if (m) flags.push({ type: "word", value: m[0] }); }
    for (var i = 0; i < compiled.regexList.length; i++) {
      var r = compiled.regexList[i]; r.re.lastIndex = 0;
      if (r.re.test(text)) flags.push({ type: "regex", value: r.src });
    }
    if (compiled.hashtagRe) { compiled.hashtagRe.lastIndex = 0; var hm = compiled.hashtagRe.exec(text); if (hm) flags.push({ type: "hashtag", value: hm[0] }); }
    if (compiled.companies.length) {
      var hay = (((info && info.name) || "") + " " + ((info && info.url) || "") + " " + text).toLowerCase();
      for (var c = 0; c < compiled.companies.length; c++) {
        var comp = compiled.companies[c].toLowerCase();
        if (comp && hay.indexOf(comp) !== -1) { flags.push({ type: "company", value: compiled.companies[c] }); break; }
      }
    }
    return flags;
  }

  // Compact detail string for the stub ("word \"crypto\", #hustle").
  function detail(flags) {
    return flags.map(function (f) {
      if (f.type === "hashtag") return f.value;
      if (f.type === "company") return f.value;
      if (f.type === "regex") return "/" + f.value + "/";
      return '"' + f.value + '"';
    }).slice(0, 5).join(", ");
  }

  var api = { esc: esc, compile: compile, anyConfigured: anyConfigured, match: match, detail: detail };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerCustom = api;
})(typeof self !== "undefined" ? self : this);
