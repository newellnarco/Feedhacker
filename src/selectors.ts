// FeedHacker — centralized LinkedIn DOM "contract". LinkedIn ships hashed CSS
// classes, so everything hangs off a handful of stable hooks (heading text,
// componentkey, aria-labels). Keeping them in ONE place means a LinkedIn markup
// change is a config edit here, not a hunt across files. feed.js falls back to
// inline defaults if this module isn't present (defensive), but in the packaged
// extension this loads first.
(function (root) {
  "use strict";

  // LinkedIn gives every real member post an overflow control ("Open control menu for post by
  // <name>") and gives its OWN feed modules none. That single asymmetry does two jobs here: it
  // is the marker-independent "posts rendered" probe (contentCount, FH-052) and it is the
  // corroborating signal that separates a module from a post (FURNITURE_RE, FH-053).
  var POST_CONTROL = '[aria-label^="Open control menu for post"]';

  var api = {
    // Hidden heading that marks each feed post ("Feed post" / "Promoted").
    MARKER_RE: /^(feed post|promoted)/i,
    POST_CONTROL_SELECTOR: POST_CONTROL,

    // LinkedIn's own feed modules wear the same hidden "Feed post" heading real posts do, so the
    // scan picks them up as if a member had written them. Matched against the post's text with
    // the marker prefix removed. Deliberately a short list of headings we have actually seen:
    // an unrecognised module is simply scanned as before (fail CLOSED), whereas guessing wide
    // risks silently exempting real posts from filtering. See isFurniture() in feed.ts, which
    // additionally requires POST_CONTROL to be absent before believing any of these.
    // No trailing \b: LinkedIn renders the heading and the next element's text as adjacent
    // nodes, so the string really is "Who's viewed your profileSteve Hawkins" with no boundary
    // to match. Both apostrophes are accepted — LinkedIn uses the curly one in places.
    FURNITURE_RE: /^(who[’'`]s viewed your profile|jobs recommended for you|people you may know|add to your feed|suggested for you|recommended for you)/i,
    // Strips the hidden marker heading off the front of a post's text so FURNITURE_RE can see
    // what the container actually leads with.
    stripMarker: function (text) {
      return String(text || "").replace(/^\s*(?:feed post|promoted)\s*/i, "");
    },
    // Per-comment text node attribute prefix.
    COMMENT_KEY_PREFIX: "comment-commentary",
    COMMENT_KEY_SELECTOR: '[componentkey^="comment-commentary"]',
    // aria-label that identifies a single comment's overflow menu.
    COMMENT_ANCHOR_RE: /^view more options for .+ comment/i,
    // aria-label of the comment composer (present before comments lazy-load).
    COMPOSER_RE: /creating comment|add a comment/i,

    // URL paths FeedHacker may operate on. "feed" is the home feed only; the rest
    // are opt-in (settings.scanEverywhere) because their markup varies.
    //
    // The home feed is /feed/ AND any ONE-level /feed/<name>/ (FH-077). LinkedIn has started
    // serving the home feed from /feed/foryou/ on some accounts while others still see /feed/
    // (a staged rollout: both seen 2026-10-12), and a feed tab can only be named by LinkedIn. An
    // exact list broke silently the first time it changed, so name the exceptions instead: the
    // one-level /feed/ pages that are NOT the home feed. Two-level paths (/feed/update/<urn>,
    // /feed/hashtag/<tag>) never match. A /feed/ page that is not a feed at all has no post
    // markers, so the scan finds nothing to do there.
    HOME_FEED_RE: /^\/feed(?:\/(?!(?:update|hashtag|follow)\/?$)[a-z0-9][a-z0-9_-]*)?\/?$/i,
    isHomeFeed: function (path) { return api.HOME_FEED_RE.test(path || ""); },
    isSupportedSurface: function (path) {
      path = path || "";
      return api.HOME_FEED_RE.test(path) ||       // home feed (/feed/, /feed/foryou/, /feed/<tab>/)
        /^\/feed\/update\//.test(path) ||          // single post permalink
        /^\/search\/results\//.test(path) ||       // search results
        /^\/(company|school)\//.test(path) ||      // company / school pages
        /^\/in\//.test(path);                      // profiles
    },

    // Pages that legitimately carry posts but are not ones FeedHacker scans by default. The
    // off-feed alarm below stays quiet on these; anywhere else, a page full of posts is news.
    KNOWN_POST_PAGES_RE: /^\/(?:feed\/|groups\/|posts\/|my-items\/|newsletters\/|events\/|pulse\/|showcase\/|hashtag\/|search\/|company\/|school\/|in\/)/,
    OFF_FEED_MIN_MARKERS: 3,
    // Pure verdict for the off-feed alarm (best_practices §80): the path gate said "not the feed",
    // yet the page is full of posts on a path we know nothing about. That disagreement is how a
    // moved home feed shows itself, and it must be logged rather than idled through, because an
    // idle extension logs nothing at all. Same shape as heartbeatBreak: active, settled, and
    // several posts (one post on an unknown page is not a feed).
    offFeedBreak: function (s) {
      if (!s || !s.active || s.loading) return false;
      if ((s.markers || 0) < api.OFF_FEED_MIN_MARKERS) return false;
      var p = s.path || "";
      return !api.isSupportedSurface(p) && !api.KNOWN_POST_PAGES_RE.test(p);
    },

    // Health probe for the heartbeat: how many post markers are on the page.
    markerCount: function (doc) {
      try {
        var hs = doc.querySelectorAll("h2"), n = 0;
        for (var i = 0; i < hs.length; i++) if (api.MARKER_RE.test((hs[i].textContent || "").trim())) n++;
        return n;
      } catch (e) { return 0; }
    },

    // Selector-INDEPENDENT "the feed actually rendered posts" probe. Counts post-like containers
    // via LinkedIn hooks that DON'T depend on our hidden-heading marker — that independence is the
    // whole point, since the heartbeat uses this to tell a real "selectors out of date" break
    // (posts present, none match our marker) from an empty feed between page loads.
    //
    // FH-052: LinkedIn's redesigned feed dropped BOTH hooks this used to rely on. Two live
    // home-feed captures (2026-09-15, 8 and 42 posts) contain no role="article" and no
    // data-urn/data-id activity container anywhere on the page — so the probe returned 0 on a
    // fully rendered feed. heartbeatBreak() requires content > 0, so a probe pinned at 0 meant the
    // break could NEVER fire: the one alarm that tells us our marker has stopped matching was
    // silently dead. The per-post overflow control ("Open control menu for post by <name>") is
    // LinkedIn's own a11y hook, emitted once per post and independent of the "Feed post" heading
    // (40 of 42 and 7 of 8 posts in those captures). The retired hooks stay in the list so the
    // probe keeps working anywhere they survive, and so this is purely additive.
    //
    // English-only, like MARKER_RE above — and deliberately no worse than it. On a localized
    // LinkedIn both stop matching together, so the probe reads 0 exactly where the marker reads 0
    // and the result is silence, not a false alarm. (FeedHacker not filtering a non-English feed
    // at all is a separate, pre-existing gap; it is not this probe's to fix.)
    CONTENT_SELECTOR: '[role="article"], [data-urn*="urn:li:activity"], [data-id*="urn:li:activity"], ' + POST_CONTROL,
    contentCount: function (doc) {
      try {
        var a = doc.querySelectorAll(api.CONTENT_SELECTOR);
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
