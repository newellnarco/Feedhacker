// FeedHacker — update check. Pure helpers for comparing the running version against
// the latest GitHub release, plus a thin fetch wrapper. Kept UI-free and dependency-
// free so it unit-tests cleanly; options.js renders the result. GitHub's REST API
// sends permissive CORS headers, so an extension page can call it with no extra host
// permission.
(function (root) {
  "use strict";

  var REPO = "newellnarco/Feedhacker";

  function apiUrl(repo) { return "https://api.github.com/repos/" + (repo || REPO) + "/releases/latest"; }
  function releasesUrl(repo) { return "https://github.com/" + (repo || REPO) + "/releases/latest"; }

  // "v1.2.3" / "1.2" -> [1,2,3] / [1,2]. Non-numeric junk becomes 0.
  function parseVersion(s) {
    return String(s == null ? "" : s).trim().replace(/^v/i, "").split(".")
      .map(function (p) { var n = parseInt(p, 10); return isNaN(n) ? 0 : n; });
  }

  // -1 if a<b, 0 if equal, 1 if a>b (component-wise, shorter side zero-padded).
  function compareVersions(a, b) {
    var x = parseVersion(a), y = parseVersion(b);
    var n = Math.max(x.length, y.length);
    for (var i = 0; i < n; i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
  }

  function isNewer(latest, current) { return compareVersions(latest, current) > 0; }

  // Fetch the latest release and report whether it's newer than `current`. `fetchImpl`
  // is injectable for tests; defaults to the page's fetch. Never throws for the caller
  // to have to guard twice — it resolves a well-formed result or rejects with an Error.
  function checkForUpdate(fetchImpl, current, repo) {
    var f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.reject(new Error("no fetch available"));
    return f(apiUrl(repo)).then(function (r) {
      if (!r || !r.ok) throw new Error("GitHub API HTTP " + (r && r.status));
      return r.json();
    }).then(function (data) {
      var latest = (data && (data.tag_name || data.name) || "").replace(/^v/i, "");
      if (!latest) throw new Error("release has no version tag");
      return {
        current: String(current || ""),
        latest: latest,
        updateAvailable: isNewer(latest, current),
        url: releasesUrl(repo),
      };
    });
  }

  var api = {
    REPO: REPO,
    apiUrl: apiUrl,
    releasesUrl: releasesUrl,
    parseVersion: parseVersion,
    compareVersions: compareVersions,
    isNewer: isNewer,
    checkForUpdate: checkForUpdate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerUpdate = api;
})(typeof self !== "undefined" ? self : this);
