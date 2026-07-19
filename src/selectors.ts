// FeedHacker — centralized LinkedIn DOM "contract". LinkedIn ships hashed CSS
// classes, so everything hangs off a handful of stable hooks (heading text,
// componentkey, aria-labels). Keeping them in ONE place means a LinkedIn markup
// change is a config edit here, not a hunt across files. feed.js falls back to
// inline defaults if this module isn't present (defensive), but in the packaged
// extension this loads first.
(function (root) {
  "use strict";

  var api = {
    // Hidden heading that marks each feed post ("Feed post" / "Promoted").
    MARKER_RE: /^(feed post|promoted)/i,
    // Per-comment text node attribute prefix.
    COMMENT_KEY_PREFIX: "comment-commentary",
    COMMENT_KEY_SELECTOR: '[componentkey^="comment-commentary"]',
    // aria-label that identifies a single comment's overflow menu.
    COMMENT_ANCHOR_RE: /^view more options for .+ comment/i,
    // aria-label of the comment composer (present before comments lazy-load).
    COMPOSER_RE: /creating comment|add a comment/i,

    // URL paths FeedHacker may operate on. "feed" is the home feed only; the rest
    // are opt-in (settings.scanEverywhere) because their markup varies.
    isHomeFeed: function (path) { return /^\/feed\/?$/.test(path || ""); },
    isSupportedSurface: function (path) {
      path = path || "";
      return /^\/feed\/?$/.test(path) ||          // home feed
        /^\/feed\/update\//.test(path) ||          // single post permalink
        /^\/search\/results\//.test(path) ||       // search results
        /^\/(company|school)\//.test(path) ||      // company / school pages
        /^\/in\//.test(path);                      // profiles
    },

    // Health probe for the heartbeat: how many post markers are on the page.
    markerCount: function (doc) {
      try {
        var hs = doc.querySelectorAll("h2"), n = 0;
        for (var i = 0; i < hs.length; i++) if (api.MARKER_RE.test((hs[i].textContent || "").trim())) n++;
        return n;
      } catch (e) { return 0; }
    },

    // Selector-INDEPENDENT "the feed actually rendered posts" probe. Counts post-like
    // containers via LinkedIn's stable hooks that DON'T depend on our hidden-heading marker:
    // role="article" (per-update a11y hook) and the activity-URN container (data hook). Used by
    // the heartbeat to tell a real "selectors out of date" break (posts present, none match our
    // marker) from an empty feed between page loads (nothing there yet — LinkedIn paging, not us).
    contentCount: function (doc) {
      try {
        var a = doc.querySelectorAll('[role="article"], [data-urn*="urn:li:activity"], [data-id*="urn:li:activity"]');
        return a ? a.length : 0;
      } catch (e) { return 0; }
    },

    // True while LinkedIn is fetching/paging the feed. It marks the region aria-busy and renders
    // its own loaders / skeleton placeholders; zero markers during a load is expected, not a break.
    isLoading: function (doc) {
      try {
        return !!doc.querySelector('[aria-busy="true"], .artdeco-loader, [class*="skeleton"]');
      } catch (e) { return false; }
    },

    // Pure verdict for the heartbeat. A genuine "selectors out of date" break is ONLY when the tab
    // is active, LinkedIn isn't mid-load, the feed actually rendered posts (content > 0), yet NONE
    // match our marker (markers === 0). Every other shape — empty/paging feed, still loading,
    // background tab — is collateral and must NOT alarm. Kept pure so it's unit-testable.
    heartbeatBreak: function (s) {
      return !!(s && s.active && !s.loading && s.markers === 0 && s.content > 0);
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerSelectors = api;
})(typeof self !== "undefined" ? self : this);
