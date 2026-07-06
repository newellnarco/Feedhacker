// FeedHacker — DOM layer. No chrome.* APIs, so it is unit-testable under jsdom.
// Posts are found via LinkedIn's hidden <h2>Feed post</h2> heading (feed CSS is hashed).
// Each enabled filter flags a post; a global mode decides whether matches are HIDDEN
// (default) or are the ONLY things shown (isolate mode).
(function (root) {
  "use strict";

  var SEL = root.FeedHackerSelectors;
  var MARKER_RE = SEL ? SEL.MARKER_RE : /^(feed post|promoted)/i;

  function getText(el) {
    if (!el) return "";
    var t = el.innerText;
    if (t != null && t !== "") return t;
    return el.textContent || "";
  }

  function isMarker(h) { return MARKER_RE.test((h.textContent || "").trim()); }

  function leafWithText(el, re) {
    var nodes = el.querySelectorAll("button, a, span, div");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.children.length === 0 && re.test(getText(n).trim())) return true;
    }
    return false;
  }

  function isPromoted(el) { return leafWithText(el, /^promoted\b(?!\s+(?:to|as)\b)/i); } // "Promoted", "Promoted by X", "Promoted \u2022 X" (not "Promoted to/as ...")
  function isNewsletterSignup(el) {
    if (leafWithText(el, /^\+?\s*subscribe$/i)) return true;                       // Subscribe CTA
    var labeled = el.querySelectorAll("[aria-label]");
    for (var j = 0; j < labeled.length; j++) {
      if (/^subscribe\b/i.test((labeled[j].getAttribute("aria-label") || "").trim())) return true;
    }
    return false;
  }
  function isHiring(el, t) {
    t = t || getText(el);
    if (/#hiring\b|\bis hiring\b|we['’]?re hiring|\bwe are hiring\b|\bnow hiring\b|\bhiring for\b|\bjoin (our|the|my) team\b|\bwe['’]?re looking to hire\b|\bopen role(s)?\b|\bopen position(s)?\b/i.test(t)) return true;
    return leafWithText(el, /^view job$/i);                                        // job-card CTA
  }
  // "Surfaced by a reaction" header — not just likes: celebrates / loves / supports /
  // reposted / follows / commented on, plus "finds this insightful/funny".
  function isReactionReshare(el) {
    var t = getText(el).replace(/\s+/g, " ").replace(/^(Feed post|Promoted)\s*/i, "").slice(0, 100);
    return /\b(?:likes?|loves?|celebrates?|supports?|reposted|follows?|commented on|reacted to) this\b/i.test(t) ||
           /\bfinds this \w+/i.test(t);
  }

  function markerCountWithin(el) {
    var hs = el.querySelectorAll("h2"), n = 0;
    for (var i = 0; i < hs.length; i++) if (isMarker(hs[i])) n++;
    return n;
  }
  // Cache each marker's container: the walk is O(depth * h2) and a marker's container is
  // stable, so we pay it once per marker (invalidate if the marker is detached). Cap 25 is
  // headroom over LinkedIn's ~15-20-deep post nesting.
  var boxCache = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
  function postContainerFor(marker) {
    if (boxCache) { var hit = boxCache.get(marker); if (hit && hit.isConnected) return hit; }
    var cur = marker, best = marker;
    for (var i = 0; i < 25 && cur.parentElement; i++) {
      var parent = cur.parentElement;
      if (markerCountWithin(parent) > 1) { best = cur; break; }
      cur = parent; best = cur;
    }
    if (boxCache) boxCache.set(marker, best);
    return best;
  }
  function findPostContainers(doc) {
    var hs = doc.querySelectorAll("h2"), out: any[] = [];
    for (var i = 0; i < hs.length; i++) {
      if (!isMarker(hs[i])) continue;
      var c = postContainerFor(hs[i]);
      if (out.indexOf(c) === -1) out.push(c);
    }
    return out;
  }

  // Actor name (best-effort): strip a leading "{X} celebrates/likes/… this" header,
  // then take the name before the first separator. Falls back to a profile/company link.
  // First actor link (document order) that actually has a name — skips the empty
  // avatar link, and reads the clean company/person name instead of the header blob.
  function actorLinkName(el) {
    var links = el.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
    for (var i = 0; i < links.length; i++) {
      var txt = getText(links[i]).replace(/\s+/g, " ").trim();
      txt = txt.replace(/\s+(Verified|Premium)\s+Profile\b.*$/i, "")   // "Ben Davis Premium Profile 3rd+ Ben Davis" -> "Ben Davis"
               .replace(/\s*[•·].*$/, "")
               .replace(/\s+(1st|2nd|3rd\+?)\b.*$/i, "")
               .replace(/\s*\d[\d,]*\s*followers?.*/i, "").trim();
      if (txt.length >= 2 && !/^(Promoted|Follow|Page)$/i.test(txt)) return txt.slice(0, 40);
    }
    return "";
  }
  // For reshares the author follows the "X <reaction> this" header (reactor's link
  // comes first, so link-order would pick the reactor). NOTE: call while the post is
  // still visible — innerText must carry the spaces this parse relies on.
  function getActor(el) {
    var raw = getText(el).replace(/\s+/g, " ").trim();
    var head = raw.replace(/^(Feed post|Promoted)\s*/i, "").slice(0, 110);
    var isReshare = /\b(?:likes?|loves?|celebrates?|supports?|reposted|follows?|commented on|reacted to) this\b|\bfinds this \w+/i.test(head);
    if (isReshare) {
      var t = raw.replace(/^(Feed post|Promoted)\s*/i, "");
      t = t.replace(/^.{0,90}?\b(?:likes?|loves?|celebrates?|supports?|reposted|follows?|commented on|reacted to) this\b\s*/i, "");
      t = t.replace(/^.{0,90}?\bfinds this \w+\s*/i, "");
      t = t.replace(/^(Feed post|Promoted)\s*/i, "");
      var nm = (t.split(/[•·]/)[0] || "").trim().replace(/\s+\d+\s*(?:s|m|h|d|w|mo|y)$/i, "").trim();
      if (nm.length >= 2) return nm.slice(0, 40);
    }
    var byLink = actorLinkName(el);
    if (byLink) return byLink;
    var t2 = raw.replace(/^(Feed post|Promoted)\s*/i, "");
    return (t2.split(/[•·]/)[0] || "").replace(/\s+(Verified|Premium)\s+Profile\b.*$/i, "").trim().slice(0, 40);
  }

  // --- author actions: unfollow + profile quick-link ---
  // Same cleanup as actorLinkName, but returns the anchor element (so we can read its
  // href), not just the display name. Skips the empty avatar link and reactor links.
  function actorAnchor(el) {
    var links = el.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
    for (var i = 0; i < links.length; i++) {
      var txt = getText(links[i]).replace(/\s+/g, " ").trim()
        .replace(/\s+(Verified|Premium)\s+Profile\b.*$/i, "")
        .replace(/\s*[•·].*$/, "")
        .replace(/\s+(1st|2nd|3rd\+?)\b.*$/i, "")
        .replace(/\s*\d[\d,]*\s*followers?.*/i, "").trim();
      if (txt.length >= 2 && !/^(Promoted|Follow|Page)$/i.test(txt)) return links[i];
    }
    return null;
  }
  // {name, url} for the post's author. url is normalized to an absolute LinkedIn URL
  // with the query stripped; empty string when no profile link is found.
  function authorInfo(el) {
    var a = actorAnchor(el);
    var url = a ? (a.getAttribute("href") || "") : "";
    if (url && url.indexOf("http") !== 0 && url.charAt(0) === "/") url = "https://www.linkedin.com" + url;
    url = url.split("?")[0];
    return { name: getActor(el), url: url };
  }

  // A post authored by a LinkedIn Company or School page (WSJ, brands, publishers,
  // orgs) — corporate content that isn't a paid "Promoted" ad and isn't AI slop. The
  // actor's profile link is /company/… or /school/… instead of /in/… for a person.
  function isCompanyAuthor(el) {
    var url = authorInfo(el).url || "";
    return /\/(?:company|school)\//i.test(url);
  }

  // Text-based post-type filters.
  var CATEGORIES = [
    { id: "anniversary", label: "Work Anniversary",
      re: /(work anniversary|happy .{0,15}anniversary|celebrating .{0,6}\d+ years?|\b\d+\s+years?\s+(at|with|of service)\b|years of service|my .{0,10}anniversary)/i },
    { id: "job", label: "New-Job Announcement",
      re: /(starting a new (position|role|chapter|job)|is starting a new position|excited to (share|announce|join)[\s\S]{0,60}(joined|joining|new (role|position|job|chapter|adventure)|started)|happy to (share|announce)[\s\S]{0,60}(joined|new (role|position|job)|started)|thrilled to[\s\S]{0,40}(join|new (role|position))|i'?m (excited|happy|thrilled|pleased) to[\s\S]{0,50}(new (role|position|chapter)|joined|joining)|new beginnings|first day at my new|i('?ve| have) joined|delighted to join|new role at|joining .{0,30}as (a|an|the|their))/i },
    { id: "cert", label: "Training & Certification",
      re: /(certif(y|ied|icate|ication)|credential|professional certificate|milestone reached|officially completed|completed[\s\S]{0,30}(course|training|program|bootcamp|certificate|certification)|earned[\s\S]{0,25}(certificate|certification|badge|credential)|passed[\s\S]{0,15}(the )?(exam|certification)|added a new certification|just completed[\s\S]{0,20}(course|training|certif))/i }
  ];

  // Filter ids in display order come from the shared source of truth (filters.js).
  // Fallback list keeps feed.js usable if loaded standalone (defensive; tests load
  // filters.js first). job/anniversary/cert are the text-regex CATEGORIES above.
  var Filters = root.FeedHackerFilters;
  var FILTER_IDS = Filters ? Filters.FILTER_IDS : ["sloppy", "promoted", "newsletter", "hiring", "likes", "job", "anniversary", "cert"];
  var cap = Filters ? Filters.cap : function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
  function listActive(s, kind) {
    var out: any[] = [];
    for (var i = 0; i < FILTER_IDS.length; i++) if (s[kind + cap(FILTER_IDS[i])]) out.push(FILTER_IDS[i]);
    return out;
  }
  function anyActive(s) {
    if (!s) return false;
    if (listActive(s, "mute").length > 0 || listActive(s, "solo").length > 0) return true;
    if (s.customActive) return true;        // user has custom filters configured
    if (s.authorMutesActive) return true;   // user has muted at least one author
    return false;
  }

  // Flags [{id,label,detail}] for the ACTIVE filter ids this post matches.
  // Text of a post EXCLUDING its comments, so a claudism in a comment doesn't flag the
  // post itself. Only clones when the post actually contains comments.
  function findComposer(root) {   // the "Add a comment" box — present at load, unlike lazy comments
    var labeled = root.querySelectorAll("[aria-label]");
    for (var i = 0; i < labeled.length; i++) {
      if (/creating comment|add a comment/i.test(labeled[i].getAttribute("aria-label") || "")) return labeled[i];
    }
    return null;
  }
  // The comment SECTION = the child of the post container that holds the composer (and,
  // below it, all comments). Walk up from the composer until the parent is the post
  // container (has the "Feed post" h2); the body is an EARLIER sibling, so it's safe.
  function commentSectionFor(composer) {
    var cur = composer, best = composer;
    for (var i = 0; i < 14 && cur.parentElement; i++) {
      var p = cur.parentElement, h = p.querySelectorAll("h2"), atPost = false;
      for (var k = 0; k < h.length; k++) if (isMarker(h[k])) { atPost = true; break; }
      if (atPost) { best = cur; break; }
      cur = p; best = cur;
    }
    return best;
  }
  function getPostText(el) {
    var comp0 = findComposer(el), hasComment = false;
    if (!comp0) {
      var lab = el.querySelectorAll("[aria-label]");
      for (var i = 0; i < lab.length; i++) if (isCommentAnchor(lab[i])) { hasComment = true; break; }
    }
    if (!comp0 && !hasComment) return getText(el);   // no comment area at all
    var clone = el.cloneNode(true);
    var comp = findComposer(clone);
    if (comp) {
      var sec = commentSectionFor(comp);
      if (sec && sec !== clone && sec.parentNode) {
        while (sec.nextSibling) sec.parentNode.removeChild(sec.nextSibling); // remove section + anything after it
        sec.parentNode.removeChild(sec);
      }
    }
    var ck = clone.querySelectorAll('[componentkey^="comment-commentary"]');   // strip comments (preview + expanded)
    for (var k = 0; k < ck.length; k++) {
      var b = commentBlockFor(ck[k]);
      if (b && b !== clone && b.parentNode) b.parentNode.removeChild(b);
    }
    var a2 = clone.querySelectorAll("[aria-label]");   // belt-and-suspenders: stray anchor-based comments
    for (var j = 0; j < a2.length; j++) {
      if (!isCommentAnchor(a2[j])) continue;
      var cc = commentContainerFor(a2[j]);
      if (cc && cc !== clone && cc.parentNode) cc.parentNode.removeChild(cc);
    }
    return getText(clone);
  }

  // Score post text for AI slop via the structural-tell scorer (scorer.js), which
  // combines the phrase banlist with layout/rhetoric tells through learned weights.
  // Returns a flag with .features attached so the glue layer can learn from feedback.
  function scoreSloppy(text, matchers, settings) {
    if (!root.FeedHackerScorer) return null;
    var res = root.FeedHackerScorer.classify(
      text,
      settings && settings.slopWeights,
      {
        matchers: matchers,
        aggressive: settings && settings.aggressive,
        threshold: settings && typeof settings.slopThreshold === "number" ? settings.slopThreshold : undefined
      }
    );
    if (!res.isSlop) return null;
    return { id: "sloppy", label: "AI Slop", detail: res.detail, features: res.features };
  }

  function matchedFlags(el, matchers, activeIds, text, settings) {
    settings = settings || {};
    if (text == null) text = getPostText(el);   // exclude comment text from post scoring
    if (!text.trim()) return [];
    function on(id) { return activeIds.indexOf(id) !== -1; }
    var flags: any[] = [];
    if (on("sloppy")) {
      var sf = scoreSloppy(text, matchers, settings);
      if (sf) flags.push(sf);
    }
    if (on("promoted") && isPromoted(el)) flags.push({ id: "promoted", label: "Promoted Post", detail: "" });
    if (on("company") && isCompanyAuthor(el)) flags.push({ id: "company", label: "Company / Brand", detail: "" });
    if (on("newsletter") && isNewsletterSignup(el)) flags.push({ id: "newsletter", label: "Newsletter Signup", detail: "" });
    if (on("hiring") && isHiring(el, text)) flags.push({ id: "hiring", label: "Hiring", detail: "" });
    if (on("likes") && isReactionReshare(el)) flags.push({ id: "likes", label: "Reaction Reshare", detail: "" });
    for (var c = 0; c < CATEGORIES.length; c++) {
      var catf = CATEGORIES[c];
      if (on(catf.id) && catf.re.test(text)) flags.push({ id: catf.id, label: catf.label, detail: "" });
    }
    return flags;
  }

  function labelsText(flags) { return flags.map(function (f) { return f.label; }).join(", "); }
  function collapsedText(el, flags, settings) {
    // The AI-slop reason is conveyed by the green splat icon + the stub's hover title,
    // so it isn't printed here — only the other categories are.
    var cats = flags.filter(function (f) { return f.id !== "sloppy"; })
      .map(function (f) { return f.label; }).join(", ");
    if (!settings.nameNames) return cats;
    var name = el.dataset.feedhackerActor || getActor(el) || "Someone";
    return cats ? name + " (" + cats + ")" : name;   // name (+ any non-slop categories)
  }

  // A one-line preview of a flagged post's opening, so the stub carries enough for the
  // user to judge a probabilistic AI-slop call WITHOUT expanding it. Built from the same
  // innerText the scorer saw. In a real browser innerText puts the actor name, headline
  // and timestamp on their own lines ahead of the commentary, so we skip those metadata
  // lines and take the first line of real content; under jsdom (no block newlines) the
  // post collapses to one line, so we strip a leading name echo and trim from there.
  // Metadata lines that never carry post content: connection degree, CTAs, "Edited",
  // visibility, follower counts, and the timestamp row.
  var PREVIEW_META_RE = /^(?:•\s*)?(?:1st|2nd|3rd\+?|following|follow|connect|message|promoted|edited|see translation|visible to\b.*|and \d[\d,]* others?|\d[\d,]*\s+(?:followers?|connections?)|\d+\s*(?:s|m|h|d|w|mo|y)(?:\s*•.*)?)$/i;
  // The post's timestamp row ("2h", "1d • Edited", "Now") is the LAST header element
  // before the commentary — a reliable boundary between the actor header and the body.
  var PREVIEW_TS_RE = /^(?:•\s*)?(?:now|\d+\s*(?:s|m|h|d|w|mo|y|hr|hrs|min|mins|sec|secs))\b/i;
  function truncatePreview(s, n) {
    s = (s || "").replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    var cut = s.slice(0, n), sp = cut.lastIndexOf(" ");
    if (sp > n * 0.6) cut = cut.slice(0, sp);           // prefer a word boundary
    return cut.replace(/[\s.,;:!?–—-]+$/, "") + "…";
  }
  function firstBodyLine(text, name) {
    var raw = (text || "").replace(/^(Feed post|Promoted)\s*/i, "");
    var nm = (name || "").replace(/\s+/g, " ").trim();
    // Only treat `name` as a header echo to strip when it reads like a real name — not
    // when getActor fell back to body text (long, or carrying sentence punctuation).
    var nameLc = (nm.length >= 2 && nm.length < 40 && !/[:!?]/.test(nm)) ? nm.toLowerCase() : "";
    function stripName(s) {
      for (var g = 0; g < 3 && nameLc && s.toLowerCase().indexOf(nameLc) === 0; g++) {
        s = s.slice(nm.length).replace(/^[\s•·|,–—-]+/, "");
      }
      return s;
    }
    var lines: any[] = [];
    var split = raw.split(/[\r\n]+/);
    for (var s0 = 0; s0 < split.length; s0++) {
      var t0 = split[s0].replace(/\s+/g, " ").trim();
      if (t0) lines.push(t0);
    }
    // Primary: the first real line AFTER the timestamp row skips the whole actor header
    // (name, degree, headline) even when a job headline looks like content.
    var pick = "", passedTs = false;
    for (var i = 0; i < lines.length; i++) {
      if (PREVIEW_TS_RE.test(lines[i])) { passedTs = true; continue; }
      if (!passedTs || PREVIEW_META_RE.test(lines[i])) continue;
      var body = stripName(lines[i]);
      if (body) { pick = body; break; }
    }
    // Fallback (single-blob innerText, or no timestamp row): strip a leading name echo
    // and obvious metadata, then take the first remaining line.
    for (var j = 0; !pick && j < lines.length; j++) {
      var l2 = stripName(lines[j]);
      if (l2 && !PREVIEW_META_RE.test(l2)) pick = l2;
    }
    return truncatePreview(pick, 140);
  }
  function explainerText(flags) {
    return "Flagged: " + flags.map(function (f) {
      return f.detail ? f.label + " (" + f.detail + ")" : f.label;
    }).join(" • ");
  }

  // Report a correction to the learner. "Show anyway" on a slop-flagged post is a
  // false positive (label 0); "Hide again" after revealing confirms it (label 1).
  // Only fires for the sloppy filter (the only learned one) and when features were
  // stashed. settings.onFeedback is supplied by the glue layer (chrome-aware).
  function emitFeedback(el, flags, settings, label) {
    if (!settings || typeof settings.onFeedback !== "function") return;
    var isSloppy = false;
    for (var i = 0; i < flags.length; i++) if (flags[i].id === "sloppy") { isSloppy = true; break; }
    if (!isSloppy) return;
    var feats: any = null;
    try { if (el.dataset.feedhackerFeatures) feats = JSON.parse(el.dataset.feedhackerFeatures); } catch (e) {}
    if (feats) settings.onFeedback(feats, label);
  }

  function directChildStub(el) {
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (c.classList && c.classList.contains("feedhacker-stub")) return c;
    }
    return null;
  }
  function clearEl(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // After the user confirms slop or mutes the author, retire the whole row: fade/slide
  // it out (feedhacker-dismissing), then drop it from layout (feedhacker-gone) so the feed
  // closes up. Idempotent; degrades to an immediate hide where transitions/timers are
  // unavailable (tests). The timer is unref'd so it never keeps a process alive.
  function dismissRow(el) {
    if (!el || el.dataset.feedhackerDismissing === "1") return;
    el.dataset.feedhackerDismissing = "1";
    el.classList.add("feedhacker-dismissing");
    var gone = function () { el.classList.add("feedhacker-gone"); };
    el.addEventListener("transitionend", function h(e) {
      if (e && e.propertyName && e.propertyName !== "opacity") return;
      el.removeEventListener("transitionend", h); gone();
    });
    try { var t: any = setTimeout(gone, 400); if (t && typeof t.unref === "function") t.unref(); }
    catch (e) { gone(); }
  }

  // A compact two-line stub button (e.g. "Mute" / "author"), so the action cluster stays
  // narrow and uniform. Two stacked spans guarantee the label always wraps to two rows.
  function twoRowButton(doc, cls, top, bottom) {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "feedhacker-btn2 " + cls;
    var a = doc.createElement("span"); a.textContent = top;
    var c = doc.createElement("span"); c.textContent = bottom;
    b.appendChild(a); b.appendChild(c);
    return b;
  }

  // --- inline SVG icons for the stub action buttons (crisp, colorable, no assets) ---
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(doc, tag, attrs, kids?: any[]) {
    var e = doc.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (kids) for (var i = 0; i < kids.length; i++) e.appendChild(kids[i]);
    return e;
  }
  function iconSvg(doc, opts, kids?: any[]) {
    return svgEl(doc, "svg", {
      viewBox: "0 0 24 24", width: "25", height: "25",
      fill: opts.fill || "none", stroke: opts.stroke || "none",
      "stroke-width": opts.sw || "0", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"
    }, kids);
  }
  // Green slime splat — AI slop. Built as a central blob plus radiating bulbous arms
  // (rotated ellipses) and a couple of flung droplets, so it reads clearly as a splat.
  function splatIcon(doc) {
    // Organic slime splat: a big off-centre blob with tapered arms of VARIED length and
    // thickness (round-capped stems + bulb tips) at irregular angles, plus flung droplets.
    var arms = [   // [stemInnerX, stemInnerY, tipX, tipY, thickness, bulbRadius]
      [11.5, 9.0, 10.2, 1.9, 3.4, 2.3],   [9.4, 10.5, 5.1, 8.0, 2.5, 1.7],
      [9.1, 12.8, 1.9, 14.9, 3.8, 2.6],   [10.2, 14.4, 6.7, 18.8, 2.3, 1.6],
      [12.0, 15.0, 12.0, 21.6, 4.1, 2.6], [14.2, 14.0, 20.1, 19.3, 2.9, 2.1],
      [14.8, 10.9, 20.2, 8.7, 2.7, 2.0]
    ];
    var kids: any[] = [svgEl(doc, "circle", { cx: "11.8", cy: "12.4", r: "6.5", fill: "currentColor" })];
    for (var i = 0; i < arms.length; i++) {
      var a = arms[i];
      kids.push(svgEl(doc, "line", {
        x1: String(a[0]), y1: String(a[1]), x2: String(a[2]), y2: String(a[3]),
        stroke: "currentColor", "stroke-width": String(a[4]), "stroke-linecap": "round"
      }));
      kids.push(svgEl(doc, "circle", { cx: String(a[2]), cy: String(a[3]), r: String(a[5]), fill: "currentColor" }));
    }
    kids.push(svgEl(doc, "circle", { cx: "3.3", cy: "4.3", r: "1.5", fill: "currentColor" }));
    kids.push(svgEl(doc, "circle", { cx: "21.4", cy: "5.6", r: "0.9", fill: "currentColor" }));
    kids.push(svgEl(doc, "circle", { cx: "20.4", cy: "21.2", r: "1.1", fill: "currentColor" }));
    return iconSvg(doc, { fill: "currentColor" }, kids);
  }
  // Muted microphone in a red disc — Mute author.
  function micOffIcon(doc) {
    return iconSvg(doc, {}, [
      svgEl(doc, "circle", { cx: "12", cy: "12", r: "11", fill: "#d93a2f" }),
      svgEl(doc, "rect", { x: "9.4", y: "5", width: "5.2", height: "8", rx: "2.6", fill: "#fff" }),
      svgEl(doc, "path", { d: "M7.5 11.4a4.5 4.5 0 0 0 9 0", fill: "none", stroke: "#fff", "stroke-width": "1.6", "stroke-linecap": "round" }),
      svgEl(doc, "line", { x1: "12", y1: "15.9", x2: "12", y2: "18.4", stroke: "#fff", "stroke-width": "1.6", "stroke-linecap": "round" }),
      svgEl(doc, "line", { x1: "9", y1: "18.6", x2: "15", y2: "18.6", stroke: "#fff", "stroke-width": "1.6", "stroke-linecap": "round" }),
      svgEl(doc, "line", { x1: "6.2", y1: "5.6", x2: "18", y2: "18.2", stroke: "#fff", "stroke-width": "2.1", "stroke-linecap": "round" })
    ]);
  }
  // Eye with a blue iris — Always show (whitelist).
  function eyeIcon(doc) {
    return iconSvg(doc, {}, [
      svgEl(doc, "path", { d: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", fill: "#fff", stroke: "#141414", "stroke-width": "1.7", "stroke-linejoin": "round" }),
      svgEl(doc, "circle", { cx: "12", cy: "12", r: "4.4", fill: "#3e5f8a", stroke: "#141414", "stroke-width": "1.1" }),
      svgEl(doc, "circle", { cx: "12", cy: "12", r: "2.1", fill: "#15233b" }),
      svgEl(doc, "circle", { cx: "13.2", cy: "10.9", r: "0.85", fill: "#fff" })
    ]);
  }
  // Square with an up-right arrow — open profile in a new tab.
  function extLinkIcon(doc) {
    return iconSvg(doc, { stroke: "currentColor", sw: "2" }, [
      svgEl(doc, "path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
      svgEl(doc, "path", { d: "M15 3h6v6" }),
      svgEl(doc, "path", { d: "M10 14 21 3" })
    ]);
  }
  function iconButton(doc, cls, iconNode, title) {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "feedhacker-iconbtn " + cls;
    b.title = title; b.setAttribute("aria-label", title);
    b.appendChild(iconNode);
    return b;
  }

  function hasFlag(flags, id) {
    for (var i = 0; i < flags.length; i++) if (flags[i].id === id) return true;
    return false;
  }

  // Permanently show this author: allowlist them (don't ask again) and reveal the post now.
  function revealAllowed(el, stub) {
    el.dataset.feedhackerReveal = "1";
    delete el.dataset.feedhackerHidden;
    delete el.dataset.feedhackerDismissing;
    el.classList.remove("feedhacker-hidden", "feedhacker-gone", "feedhacker-dismissing");
    if (stub && stub.parentNode) stub.parentNode.removeChild(stub);
  }

  // Author controls, added to the right-justified action cluster: Mute author (soft-block),
  // Always show (allowlist + reveal), and a compact "open profile" icon link. FeedHacker
  // never automates block/unfollow — the profile link just opens LinkedIn's own UI. Posts
  // only, not comments.
  function appendAuthorActions(doc, el, stub, actions, settings) {
    if (markerCountWithin(el) < 1) return;          // comments have no post marker; skip
    var info = authorInfo(el);
    if (!info.url && !info.name) return;
    if (settings && typeof settings.onMuteAuthor === "function") {   // one-click mute author (mic-off)
      var mute = iconButton(doc, "feedhacker-muteauthor", micOffIcon(doc), "Mute");
      mute.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); settings.onMuteAuthor(info); dismissRow(el); });
      actions.appendChild(mute);
    }
    if (settings && typeof settings.onAllowAuthor === "function") {   // one-click allowlist (eye)
      var allow = iconButton(doc, "feedhacker-allow", eyeIcon(doc), "Always show");
      allow.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        settings.onAllowAuthor(info);
        revealAllowed(el, stub);
      });
      actions.appendChild(allow);
    }
    if (info.url) {
      var prof = doc.createElement("a");
      prof.className = "feedhacker-iconbtn feedhacker-profile"; prof.href = info.url;
      prof.target = "_blank"; prof.rel = "noopener noreferrer";
      prof.appendChild(extLinkIcon(doc));
      prof.title = "Visit profile";
      prof.setAttribute("aria-label", info.name ? "Visit " + info.name + "'s profile" : "Visit profile");
      prof.addEventListener("click", function (ev) { ev.stopPropagation(); });
      actions.appendChild(prof);
    }
  }

  // Author + opening line on an AI-slop stub. Slop is the one probabilistic filter, so
  // we always surface who wrote it and what it says — enough to make the call without
  // clicking "Show anyway". Not a control (no automation), so comment stubs get it too.
  function appendSlopPreview(doc, el, stub, settings, flags) {
    if (!hasFlag(flags, "sloppy")) return;
    var line = el.dataset.feedhackerPreview || "";
    var name = el.dataset.feedhackerActor || "";
    if (!line && !name) return;
    var wrap = doc.createElement("span");
    wrap.className = "feedhacker-preview";
    // Skip the name here when "Name names" already puts it in the label, to avoid echo.
    if (name && !settings.nameNames) {
      var who = doc.createElement("b");
      who.className = "feedhacker-preview-author";
      who.textContent = name;
      wrap.appendChild(who);
    }
    if (line) {
      var q = doc.createElement("span");
      q.className = "feedhacker-preview-line";
      q.textContent = (wrap.childNodes.length ? ": " : "") + "“" + line + "”";
      wrap.appendChild(q);
    }
    stub.classList.add("feedhacker-has-preview");
    stub.appendChild(wrap);
  }

  // Three-line stub for the "Name + sample + category" display mode: who wrote it,
  // a sample of the hidden text, and the filter category — stacked. A richer superset
  // of "Name names", so it takes precedence and replaces the single-line label +
  // inline preview (no echo). Sample/name come from the datasets captured at hide time.
  function appendNameSampleStub(doc, el, stub, flags) {
    stub.classList.add("feedhacker-has-namesample");
    var block = doc.createElement("span");
    block.className = "feedhacker-namesample";
    var name = doc.createElement("b");
    name.className = "feedhacker-ns-name";
    name.textContent = el.dataset.feedhackerActor || getActor(el) || "Someone";
    block.appendChild(name);
    var sample = el.dataset.feedhackerPreview || "";
    if (sample) {
      var s = doc.createElement("span");
      s.className = "feedhacker-ns-sample";
      s.textContent = "“" + sample + "”";
      block.appendChild(s);
    }
    var cat = doc.createElement("span");
    cat.className = "feedhacker-ns-category";
    cat.textContent = labelsText(flags);
    block.appendChild(cat);
    stub.appendChild(block);
  }

  function renderCollapsed(doc, el, stub, flags, settings) {
    clearEl(stub);
    stub.className = "feedhacker-stub";
    stub.removeAttribute("title");
    if (hasFlag(flags, "sloppy")) stub.title = "AI slop";   // reason on hover, not as text
    // "+ sample" is an add-on to "Names" — the three-line stub only applies when both
    // are on. (nameNames alone stays the one-line "Name (category)" label.)
    if (settings.nameSample && settings.nameNames) {
      appendNameSampleStub(doc, el, stub, flags);
    } else {
      var text = collapsedText(el, flags, settings);
      if (text) {
        var label = doc.createElement("span");
        label.className = "feedhacker-stub-label";
        label.textContent = text;
        stub.appendChild(label);
      }
      appendSlopPreview(doc, el, stub, settings, flags);
    }

    // Right-justified action cluster: 👍 slop, Mute author, Always show, Profile, Show anyway.
    var actions = doc.createElement("span");
    actions.className = "feedhacker-actions";

    // Explicit positive training for AI slop, without un-hiding (cleaner signal than
    // overloading Show/Hide). Only when we have the scored features to learn from.
    if (hasFlag(flags, "sloppy") && el.dataset.feedhackerFeatures && settings && typeof settings.onFeedback === "function") {
      var yes = iconButton(doc, "feedhacker-confirm", splatIcon(doc), "AI slop");
      yes.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        emitFeedback(el, flags, settings, 1);   // confirm slop (trains the filter)
        dismissRow(el);                          // then retire the row from the feed
      });
      actions.appendChild(yes);
    }

    appendAuthorActions(doc, el, stub, actions, settings);

    var btn = twoRowButton(doc, "feedhacker-show", "Show", "anyway");
    btn.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      revealWithExplainer(doc, el, stub, flags, settings);
    });
    actions.appendChild(btn);
    stub.appendChild(actions);
  }
  function revealWithExplainer(doc, el, stub, flags, settings) {
    emitFeedback(el, flags, settings, 0);   // user disagreed: false positive
    if (markerCountWithin(el) >= 1) recordOutcome(settings, authorInfo(el), false);  // kept: author "shown"
    el.dataset.feedhackerReveal = "1";
    delete el.dataset.feedhackerHidden;
    el.classList.remove("feedhacker-hidden");
    clearEl(stub);
    stub.className = "feedhacker-stub feedhacker-explainer";
    var why = doc.createElement("span");
    why.className = "feedhacker-why";
    why.textContent = explainerText(flags);
    var btn = doc.createElement("button");
    btn.type = "button"; btn.className = "feedhacker-show"; btn.textContent = "Hide again";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      reHide(doc, el, stub, flags, settings);
    });
    stub.appendChild(why); stub.appendChild(btn);
  }
  function reHide(doc, el, stub, flags, settings) {
    emitFeedback(el, flags, settings, 1);   // user re-hid: confirmed slop
    delete el.dataset.feedhackerReveal;
    el.dataset.feedhackerHidden = "1";
    el.classList.add("feedhacker-hidden");
    renderCollapsed(doc, el, stub, flags, settings);
  }

  // forceGone: hide the post outright with no stub (a "soft block"), regardless of the
  // hideCompletely setting — used for authors you've already muted, so they simply stop
  // appearing rather than showing a "Muted author" placeholder every time.
  function collapse(doc, el, flags, settings, forceGone?: boolean) {
    if (el.dataset.feedhackerReveal === "1") return;
    el.dataset.feedhackerHidden = "1";
    try {
      // Persist a slim reason list; stash scorer features separately (they drive
      // the learning update when the user later corrects this post).
      var slim = flags.map(function (f) { return { id: f.id, label: f.label, detail: f.detail }; });
      el.dataset.feedhackerReasons = JSON.stringify(slim);
      for (var fi = 0; fi < flags.length; fi++) {
        if (flags[fi].features) { el.dataset.feedhackerFeatures = JSON.stringify(flags[fi].features); break; }
      }
    } catch (e) {}
    if (settings && typeof settings.onHidden === "function") { try { settings.onHidden(flags); } catch (e) {} }
    if (forceGone || settings.hideCompletely) { el.classList.add("feedhacker-gone"); return; }
    el.classList.add("feedhacker-hidden");
    if (directChildStub(el)) return;
    var stub = doc.createElement("div");
    renderCollapsed(doc, el, stub, flags, settings);
    el.insertBefore(stub, el.firstChild);
  }

  function recordOutcome(settings, info, hidden) {
    if (settings && typeof settings.onAuthorOutcome === "function") settings.onAuthorOutcome(info, hidden);
  }

  function consider(doc, el, matchers, settings) {
    if (el.dataset.feedhackerReveal === "1") return null;
    if (el.dataset.feedhackerHidden === "1") return null;
    if (el.dataset.feedhackerScanned === "1") return null;   // judge each post ONCE — later comment/see-more mutations must not re-flag it
    var text = getPostText(el);
    if (!text.trim()) return null;                           // body not rendered yet — retried on a later scan
    el.dataset.feedhackerScanned = "1";

    // Author memory: an allowlisted author is always shown; a muted author is always
    // hidden — both independent of the per-kind toggles.
    var A = root.FeedHackerAuthors, info: any = null;
    function author() { if (info === null) info = authorInfo(el); return info; }
    if (A && settings.authors) {
      var key = A.keyFor(author());
      if (key) {
        if (A.isAllowed(settings.authors, key)) return null;
        if (A.isMuted(settings.authors, key)) {
          // Soft block: an already-muted author's posts just don't appear — hidden
          // outright, no stub. (Manage/unmute them from the options page.)
          recordOutcome(settings, author(), true);
          collapse(doc, el, [{ id: "author", label: "Muted author", detail: author().name || "" }], settings, true);
          return ["author"];
        }
      }
    }

    var solos = listActive(settings, "solo");
    var muted = listActive(settings, "mute");
    // Custom user filters act as always-on hides (only in mute mode; solo is already
    // restrictive). Computed here so they count toward "should we hide this".
    var custom: any[] = [];
    if (!solos.length && root.FeedHackerCustom && settings.customCompiled) {
      custom = root.FeedHackerCustom.match(text, author(), settings.customCompiled);
    }
    if (!solos.length && !muted.length && !custom.length) return null;
    // Capture the author + opening line while the post is still visible (innerText goes
    // empty once we hide it). The slop stub reads both back; the name also feeds "Name
    // names". Cheap here — only posts past the early-returns above reach this.
    var actor = getActor(el);
    el.dataset.feedhackerActor = actor;
    el.dataset.feedhackerPreview = firstBodyLine(text, actor);

    if (solos.length) {   // Solo wins: show ONLY soloed kinds, hide the rest.
      var flagsS = matchedFlags(el, matchers, solos, text, settings);
      if (flagsS.length) return null;
      collapse(doc, el, [{ label: "Filtered out", detail: "" }], settings);
      return ["filtered"];
    }

    var flags = matchedFlags(el, matchers, muted, text, settings);
    if (custom.length) flags.push({ id: "custom", label: "Custom filter", detail: root.FeedHackerCustom.detail(custom) });
    if (flags.length) {
      recordOutcome(settings, author(), true);
      collapse(doc, el, flags, settings);
      return flags;
    }
    return null;
  }

  // --- Comments: AI-slop comment filtering ---
  // Each comment carries a "..." menu with aria-label "View more options for {name}'s
  // comment" — a stable per-comment anchor (hashed classes give nothing else).
  function isCommentAnchor(el) {
    return /^view more options for .+ comment/i.test((el.getAttribute("aria-label") || "").trim());
  }
  function commentContainerFor(anchor) {
    function anchorCount(p) {
      var e = p.querySelectorAll("[aria-label]"), n = 0;
      for (var j = 0; j < e.length; j++) if (isCommentAnchor(e[j])) n++;
      return n;
    }
    function hasPostMarker(p) {
      var h = p.querySelectorAll("h2");
      for (var j = 0; j < h.length; j++) if (isMarker(h[j])) return true;
      return false;
    }
    function hasComposer(p) {   // the comment composer sits in the comment SECTION, not a single comment
      var e = p.querySelectorAll("[aria-label]");
      for (var j = 0; j < e.length; j++) if (/creating comment|add a comment/i.test(e[j].getAttribute("aria-label") || "")) return true;
      return false;
    }
    var cur = anchor, best = anchor;
    for (var i = 0; i < 10 && cur.parentElement; i++) {
      var p = cur.parentElement;
      // stop before the parent widens past a SINGLE comment (another comment, the post, the composer, or a big block)
      if (anchorCount(p) > 1 || hasPostMarker(p) || hasComposer(p) || getText(p).length > 700) { best = cur; break; }
      cur = p; best = cur;
    }
    return best;
  }
  // Each comment's text carries a stable componentkey="comment-commentary_<id>" —
  // present on PREVIEW comments (shown before you expand) AND expanded ones, unlike the
  // "..." menu anchor which only appears once a thread is opened. This is the primary
  // per-comment signal; walk up from it to the comment block.
  function commentBlockFor(el) {
    function commentaryCount(p) { return p.querySelectorAll('[componentkey^="comment-commentary"]').length; }
    function hasComposer(p) {
      var e = p.querySelectorAll("[aria-label]");
      for (var j = 0; j < e.length; j++) if (/creating comment|add a comment/i.test(e[j].getAttribute("aria-label") || "")) return true;
      return false;
    }
    function hasPostMarker(p) {
      var h = p.querySelectorAll("h2");
      for (var j = 0; j < h.length; j++) if (isMarker(h[j])) return true;
      return false;
    }
    var cur = el, best = el;
    for (var i = 0; i < 12 && cur.parentElement; i++) {
      var p = cur.parentElement;
      if (commentaryCount(p) > 1 || hasComposer(p) || hasPostMarker(p)) break; // don't merge with other comments / composer / post
      cur = p; best = cur;
      // stop at the FULL comment (its avatar image + author link), not just the text column,
      // so hiding removes the avatar too and doesn't leave it orphaned.
      if (cur.querySelector("img") && cur.querySelector('a[href*="/in/"]')) break;
    }
    return best;
  }
  function findCommentContainers(doc) {
    var out: any[] = [];
    var coms = doc.querySelectorAll('[componentkey^="comment-commentary"]');   // primary
    for (var i = 0; i < coms.length; i++) {
      var b = commentBlockFor(coms[i]);
      if (b && out.indexOf(b) === -1) out.push(b);
    }
    var labeled = doc.querySelectorAll("[aria-label]");                        // fallback: "..." anchor
    for (var j = 0; j < labeled.length; j++) {
      if (!isCommentAnchor(labeled[j])) continue;
      var c = commentContainerFor(labeled[j]);
      if (c && out.indexOf(c) === -1) out.push(c);
    }
    return out;
  }
  function scanComments(doc, matchers, settings) {
    // The scorer works from structural tells even with no banlist, so we only need
    // the toggle + a scorer (matchers are an optional extra signal).
    if (!settings.hideSlopComments || !root.FeedHackerScorer) return 0;
    var comments = findCommentContainers(doc), hidden = 0;
    for (var i = 0; i < comments.length; i++) {
      var el = comments[i];
      if (el.dataset.feedhackerReveal === "1" || el.dataset.feedhackerHidden === "1") continue;
      var raw = getText(el);
      if (!raw.trim()) continue;
      var len = raw.length;
      if (el.dataset.feedhackerScanned === "1" && Number(el.dataset.feedhackerLen || 0) >= len) continue;
      el.dataset.feedhackerScanned = "1"; el.dataset.feedhackerLen = String(len);
      if (!root.FeedHackerScorer) continue;
      var res = root.FeedHackerScorer.classify(raw, settings.slopWeights, { matchers: matchers, aggressive: !!settings.aggressive });
      if (!res.isSlop) continue;
      var cActor = getActor(el);
      el.dataset.feedhackerActor = cActor;
      el.dataset.feedhackerPreview = firstBodyLine(raw, cActor);
      collapse(doc, el, [{ id: "sloppy", label: "AI Slop comment", detail: res.detail, features: res.features }], settings);
      hidden++;
    }
    return hidden;
  }

  function scan(doc, matchers, settings) {
    var hidden = 0;
    if (anyActive(settings)) {
      var posts = findPostContainers(doc);
      for (var i = 0; i < posts.length; i++) {
        if (consider(doc, posts[i], matchers, settings)) hidden++;
      }
    }
    hidden += scanComments(doc, matchers, settings);   // comment filter runs on its own
    applyDigest(doc, settings);                         // group runs of hidden posts (no-op if off)
    return hidden;
  }

  // --- digest mode: group a run of consecutive hidden posts into one summary bar ---
  function clearDigest(doc) {
    var sums = doc.querySelectorAll(".feedhacker-digest-summary");
    for (var i = 0; i < sums.length; i++) if (sums[i].parentNode) sums[i].parentNode.removeChild(sums[i]);
    var d = doc.querySelectorAll(".feedhacker-digested");
    for (var j = 0; j < d.length; j++) d[j].classList.remove("feedhacker-digested");
  }
  function buildDigestSummary(doc, run) {
    var el = doc.createElement("div");
    el.className = "feedhacker-stub feedhacker-digest-summary";
    var label = doc.createElement("span");
    label.className = "feedhacker-stub-label";
    label.textContent = run.length + " low-signal posts hidden";
    var btn = doc.createElement("button");
    btn.type = "button"; btn.className = "feedhacker-show"; btn.textContent = "Show these";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      for (var k = 0; k < run.length; k++) run[k].classList.remove("feedhacker-digested");
      if (el.parentNode) el.parentNode.removeChild(el);   // reveal individual stubs
    });
    el.appendChild(label); el.appendChild(btn);
    return el;
  }
  function applyDigest(doc, settings) {
    clearDigest(doc);
    if (!settings.digest) return;
    var posts = findPostContainers(doc);
    function hidden(p) { return p.classList.contains("feedhacker-hidden"); }
    var i = 0;
    while (i < posts.length) {
      if (!hidden(posts[i])) { i++; continue; }
      var run = [posts[i]], j = i + 1;
      while (j < posts.length && hidden(posts[j]) && posts[j].parentNode && posts[j].parentNode === posts[j - 1].parentNode) {
        run.push(posts[j]); j++;
      }
      if (run.length >= 2) {
        for (var k = 0; k < run.length; k++) run[k].classList.add("feedhacker-digested");
        run[0].parentNode.insertBefore(buildDigestSummary(doc, run), run[0]);
      }
      i = j;
    }
  }

  // --- performance: mutation triage ---
  // Our own DOM (stubs, the load-more bar) mutates the feed too; the observer must
  // not treat that as new content to rescan. Pure so it can be unit-tested.
  function isOwnNode(n) {
    if (!n || n.nodeType !== 1) return false;
    if (n.id === "feedhacker-loadmore") return true;
    return !!(n.classList && (n.classList.contains("feedhacker-stub") ||
      n.classList.contains("feedhacker-explainer") ||
      n.classList.contains("feedhacker-loadmore")));
  }
  // True only if a mutation batch added at least one real (non-ours) element. Lets
  // the glue skip a full-document rescan on the common no-op / self-inflicted batch.
  function mutationsRelevant(records) {
    if (!records) return false;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r || r.type !== "childList") continue;
      var added = r.addedNodes || [];
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n && n.nodeType === 1 && !isOwnNode(n)) return true;
      }
    }
    return false;
  }

  function reset(doc) {
    clearDigest(doc);
    var stubs = doc.querySelectorAll(".feedhacker-stub");
    for (var i = 0; i < stubs.length; i++) stubs[i].remove();
    var hid = doc.querySelectorAll(".feedhacker-hidden, .feedhacker-gone, .feedhacker-dismissing");
    for (var j = 0; j < hid.length; j++) {
      hid[j].classList.remove("feedhacker-hidden");
      hid[j].classList.remove("feedhacker-gone");
      hid[j].classList.remove("feedhacker-dismissing");
    }
    var marked = doc.querySelectorAll("[data-feedhacker-scanned],[data-feedhacker-hidden],[data-feedhacker-reveal],[data-feedhacker-actor],[data-feedhacker-preview],[data-feedhacker-len],[data-feedhacker-reasons],[data-feedhacker-features],[data-feedhacker-dismissing]");
    for (var k = 0; k < marked.length; k++) {
      var el = marked[k];
      delete el.dataset.feedhackerScanned; delete el.dataset.feedhackerLen;
      delete el.dataset.feedhackerHidden; delete el.dataset.feedhackerReveal;
      delete el.dataset.feedhackerReasons;
      delete el.dataset.feedhackerActor;
      delete el.dataset.feedhackerPreview;
      delete el.dataset.feedhackerFeatures;
      delete el.dataset.feedhackerDismissing;
    }
  }

  var api = {
    getText: getText, isMarker: isMarker, isPromoted: isPromoted,
    isNewsletterSignup: isNewsletterSignup, isHiring: isHiring, isReactionReshare: isReactionReshare, isCompanyAuthor: isCompanyAuthor,
    getActor: getActor, findPostContainers: findPostContainers,
    CATEGORIES: CATEGORIES, collapse: collapse, consider: consider, scan: scan, reset: reset,
    anyActive: anyActive, matchedFlags: matchedFlags, findCommentContainers: findCommentContainers, scanComments: scanComments, listActive: listActive, FILTER_IDS: FILTER_IDS, collapsedText: collapsedText, explainerText: explainerText,
    isOwnNode: isOwnNode, mutationsRelevant: mutationsRelevant, scoreSloppy: scoreSloppy,
    authorInfo: authorInfo, actorAnchor: actorAnchor, applyDigest: applyDigest, clearDigest: clearDigest,
    firstBodyLine: firstBodyLine
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FeedHackerFeed = api;
})(typeof self !== "undefined" ? self : this);
