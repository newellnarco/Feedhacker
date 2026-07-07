"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, authors, customfilters, makeDoc } = require("../helper");

function baseSettings(over) {
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() }, over || {});
}

const SLOP_BODY =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";

function feedHtml(bodyHtml) {
  return `<!doctype html><html><body><main><div id="feed">${bodyHtml}</div></main></body></html>`;
}
function post(inner) { return `<div class="post"><h2>Feed post</h2>${inner}</div>`; }

test("findPostContainers finds each post via its 'Feed post' marker", () => {
  const doc = makeDoc(feedHtml(post("<div>one</div>") + post("<div>two</div>")));
  const posts = feed.findPostContainers(doc);
  assert.strictEqual(posts.length, 2);
  assert.ok(posts[0].classList.contains("post"));
});

test("isPromoted detects a 'Promoted' leaf label", () => {
  const doc = makeDoc(feedHtml(post("<span>Promoted</span><div>buy things</div>")));
  const el = feed.findPostContainers(doc)[0];
  assert.strictEqual(feed.isPromoted(el), true);
});

test("isPromoted ignores 'Promoted to VP' text", () => {
  const doc = makeDoc(feedHtml(post("<span>Promoted to VP of Sales</span>")));
  const el = feed.findPostContainers(doc)[0];
  assert.strictEqual(feed.isPromoted(el), false);
});

test("isCompanyAuthor detects a Company/School page author, not a person", () => {
  const co = makeDoc(feedHtml(post(`<a href="/company/wsj">The Wall Street Journal</a><div>Moving back home shows financial savvy.</div>`)));
  assert.strictEqual(feed.isCompanyAuthor(feed.findPostContainers(co)[0]), true);
  const person = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>a normal human post</div>`)));
  assert.strictEqual(feed.isCompanyAuthor(feed.findPostContainers(person)[0]), false);
});

test("Company/brand filter hides a company-authored post when muted", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/company/wsj">The Wall Street Journal</a><div>Some corporate headline here.</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const flags = feed.consider(doc, el, [], baseSettings({ muteSloppy: false, muteCompany: true }));
  assert.ok(flags && flags.some((f) => f.id === "company"), "company post flagged");
  assert.ok(el.classList.contains("feedhacker-hidden"));
});

test("isHiring detects hiring language", () => {
  const doc = makeDoc(feedHtml(post("<div>We are hiring for a backend role. #hiring</div>")));
  const el = feed.findPostContainers(doc)[0];
  assert.strictEqual(feed.isHiring(el), true);
});

test("isReactionReshare detects a reaction header", () => {
  // Trailing punctuation stands in for the whitespace real browsers' innerText adds
  // between block elements (jsdom's textContent glues them together).
  const doc = makeDoc(feedHtml(post("<div>Jane Doe likes this.</div><div>original content</div>")));
  const el = feed.findPostContainers(doc)[0];
  assert.strictEqual(feed.isReactionReshare(el), true);
});

test("consider() collapses an AI-slop post and leaves a stub + features", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const flags = feed.consider(doc, el, [], baseSettings());
  assert.ok(flags && flags.length, "should return flags");
  assert.strictEqual(flags[0].id, "sloppy");
  assert.ok(el.classList.contains("feedhacker-hidden"));
  assert.ok(el.querySelector(".feedhacker-stub"), "stub inserted");
  assert.ok(el.dataset.feedhackerFeatures, "features stashed for learning");
});

test("consider() leaves a normal human post visible", () => {
  const doc = makeDoc(feedHtml(post("<div>Fixed a bug this morning, tests pass, shipping later.</div>")));
  const el = feed.findPostContainers(doc)[0];
  assert.strictEqual(feed.consider(doc, el, [], baseSettings()), null);
  assert.ok(!el.classList.contains("feedhacker-hidden"));
});

test("solo mode hides everything except the soloed kind", () => {
  const doc = makeDoc(feedHtml(
    post("<span>Promoted</span><div>an ad</div>") +
    post("<div>just a normal human update about my weekend</div>")
  ));
  const [ad, normal] = feed.findPostContainers(doc);
  const settings = baseSettings({ muteSloppy: false, soloPromoted: true });
  assert.strictEqual(feed.consider(doc, ad, [], settings), null, "promoted kept visible");
  const r = feed.consider(doc, normal, [], settings);
  assert.deepStrictEqual(r, ["filtered"]);
  assert.ok(normal.classList.contains("feedhacker-hidden"));
});

test("hideCompletely removes the post with no stub", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings({ hideCompletely: true }));
  assert.ok(el.classList.contains("feedhacker-gone"));
  assert.strictEqual(el.querySelector(".feedhacker-stub"), null);
});

test("Show anyway teaches a false positive; Hide again confirms", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const seen = [];
  const settings = baseSettings({ onFeedback: (feats, label) => seen.push(label) });
  feed.consider(doc, el, [], settings);

  const showBtn = el.querySelector(".feedhacker-stub button.feedhacker-show");
  assert.ok(showBtn);
  showBtn.click();                     // "Show anyway" -> false positive (0)
  assert.deepStrictEqual(seen, [0]);
  assert.ok(el.dataset.feedhackerReveal === "1");

  const hideBtn = el.querySelector(".feedhacker-stub button.feedhacker-show");
  assert.ok(hideBtn);
  hideBtn.click();                     // "Hide again" -> confirmed (1)
  assert.deepStrictEqual(seen, [0, 1]);
});

test("reset() reveals everything and clears FeedHacker state", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings());
  assert.ok(el.classList.contains("feedhacker-hidden"));
  feed.reset(doc);
  assert.ok(!el.classList.contains("feedhacker-hidden"));
  assert.strictEqual(el.dataset.feedhackerHidden, undefined);
  assert.strictEqual(el.dataset.feedhackerFeatures, undefined);
  assert.strictEqual(doc.querySelector(".feedhacker-stub"), null);
});

test("Hide survives a settings re-apply (preserving reset) — the row does not pop back", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings());
  const hide = el.querySelector(".feedhacker-stub .feedhacker-hidepost");
  assert.ok(hide, "stub has a Hide control");
  hide.click();
  assert.strictEqual(el.dataset.feedhackerDismissed, "1", "Hide marks the row dismissed");
  assert.ok(el.classList.contains("feedhacker-dismissing"), "row is retiring");

  // reapply() after e.g. a settings change / mute author: preserving reset + rescan.
  feed.reset(doc, true);
  feed.scan(doc, [], baseSettings());
  assert.strictEqual(el.dataset.feedhackerDismissed, "1", "still dismissed after a preserving reset");
  assert.ok(el.classList.contains("feedhacker-dismissing"), "still retiring — did not pop back as a fresh stub");

  // A FULL reset (extension disabled / off a scanned surface) does clear it.
  feed.reset(doc);
  assert.strictEqual(el.dataset.feedhackerDismissed, undefined, "full reset clears the dismiss");
  assert.ok(!el.classList.contains("feedhacker-dismissing"));
});

test("Show anyway survives a settings re-apply — the row stays revealed", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings());
  el.querySelector(".feedhacker-stub button.feedhacker-show").click();   // Show anyway
  assert.strictEqual(el.dataset.feedhackerReveal, "1");
  assert.ok(!el.classList.contains("feedhacker-hidden"), "revealed");

  feed.reset(doc, true);
  feed.scan(doc, [], baseSettings());
  assert.strictEqual(el.dataset.feedhackerReveal, "1", "still revealed after a preserving reset");
  assert.ok(!el.classList.contains("feedhacker-hidden"), "not re-hidden by the rescan");
});

test("scanComments collapses an AI-slop comment", () => {
  const comment =
    `<div class="comment"><img src="x"><a href="/in/jane">Jane</a>` +
    `<div componentkey="comment-commentary_1">${SLOP_BODY}</div></div>`;
  const doc = makeDoc(feedHtml(post(`<div>normal body</div>${comment}`)));
  const hidden = feed.scanComments(doc, [], baseSettings({ hideSlopComments: true }));
  assert.strictEqual(hidden, 1);
  assert.ok(doc.querySelector(".comment").classList.contains("feedhacker-hidden"));
});

test("AI-slop comment stub: the splat confirms (trains) AND retires the row; Hide is labelled 'Hide'", () => {
  const comment =
    `<div class="comment"><img src="x"><a href="/in/jane">Jane</a>` +
    `<div componentkey="comment-commentary_1">${SLOP_BODY}</div></div>`;
  const doc = makeDoc(feedHtml(post(`<div>normal body</div>${comment}`)));
  const seen = [];
  feed.scanComments(doc, [], baseSettings({ hideSlopComments: true, onFeedback: (f, label) => seen.push(label) }));
  const stub = doc.querySelector(".comment .feedhacker-stub");
  assert.ok(stub, "comment gets a slop stub");
  const hide = stub.querySelector(".feedhacker-hidepost");
  assert.ok(hide, "comment stub has a Hide control");
  assert.strictEqual(hide.title, "Hide", "labelled 'Hide' for a comment");
  const confirm = stub.querySelector(".feedhacker-confirm");
  confirm.click();
  assert.deepStrictEqual(seen, [1], "confirm trains the filter");
  assert.ok(doc.querySelector(".comment").classList.contains("feedhacker-dismissing"), "confirm now also retires the row");
});

test("scanComments is a no-op when the toggle is off", () => {
  const comment =
    `<div class="comment"><img src="x"><a href="/in/jane">Jane</a>` +
    `<div componentkey="comment-commentary_1">${SLOP_BODY}</div></div>`;
  const doc = makeDoc(feedHtml(post(`<div>body</div>${comment}`)));
  assert.strictEqual(feed.scanComments(doc, [], baseSettings({ hideSlopComments: false })), 0);
});

test("isOwnNode recognizes FeedHacker's own DOM", () => {
  const doc = makeDoc("<!doctype html><body></body>");
  const stub = doc.createElement("div"); stub.className = "feedhacker-stub";
  const other = doc.createElement("div"); other.className = "post";
  assert.strictEqual(feed.isOwnNode(stub), true);
  assert.strictEqual(feed.isOwnNode(other), false);
});

test("mutationsRelevant only fires for real added elements", () => {
  const doc = makeDoc("<!doctype html><body></body>");
  const real = doc.createElement("div");
  const own = doc.createElement("div"); own.className = "feedhacker-stub";
  assert.strictEqual(feed.mutationsRelevant([{ type: "childList", addedNodes: [real] }]), true);
  assert.strictEqual(feed.mutationsRelevant([{ type: "childList", addedNodes: [own] }]), false);
  assert.strictEqual(feed.mutationsRelevant([{ type: "attributes", addedNodes: [] }]), false);
  assert.strictEqual(feed.mutationsRelevant([]), false);
});

test("authorInfo extracts name and normalized profile URL", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane-doe?trk=abc">Jane Doe</a><div>hi</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const info = feed.authorInfo(el);
  assert.strictEqual(info.url, "https://www.linkedin.com/in/jane-doe");
  assert.ok(/jane doe/i.test(info.name));
});

test("slop stub shows a Profile link for a post author (no unfollow automation)", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings());
  const stub = el.querySelector(".feedhacker-stub");
  const prof = stub.querySelector("a.feedhacker-profile");
  assert.ok(prof, "profile link present");
  assert.strictEqual(prof.getAttribute("target"), "_blank");
  assert.ok(/\/in\/jane$/.test(prof.getAttribute("href")));
  assert.strictEqual(stub.querySelector(".feedhacker-unfollow"), null, "no unfollow button");
});

test("comment stubs get no author controls", () => {
  const comment =
    `<div class="comment"><img src="x"><a href="/in/jane">Jane</a>` +
    `<div componentkey="comment-commentary_1">${SLOP_BODY}</div></div>`;
  const doc = makeDoc(feedHtml(post(`<div>body</div>${comment}`)));
  feed.scanComments(doc, [], baseSettings({ hideSlopComments: true }));
  const stub = doc.querySelector(".comment .feedhacker-stub");
  assert.ok(stub, "comment stub exists");
  assert.strictEqual(stub.querySelector("a.feedhacker-profile"), null);
});

test("no unfollow automation is exposed by the API", () => {
  assert.strictEqual(feed.attemptUnfollow, undefined);
  assert.strictEqual(feed.findUnfollowItem, undefined);
  assert.strictEqual(feed.humanClick, undefined);
});

test("anyActive reflects mute/solo toggles, custom filters, and author mutes", () => {
  assert.strictEqual(feed.anyActive(baseSettings({ muteSloppy: false })), false);
  assert.strictEqual(feed.anyActive(baseSettings({ muteSloppy: true })), true);
  assert.strictEqual(feed.anyActive(baseSettings({ muteSloppy: false, soloHiring: true })), true);
  assert.strictEqual(feed.anyActive(baseSettings({ muteSloppy: false, customActive: true })), true);
  assert.strictEqual(feed.anyActive(baseSettings({ muteSloppy: false, authorMutesActive: true })), true);
});

test("muted author is hidden regardless of content; allowed author always shows", () => {
  const html = feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>a totally normal human post</div>`));
  // muted
  let doc = makeDoc(html);
  let el = feed.findPostContainers(doc)[0];
  let store = authors.mute({}, "/in/jane", "Jane Doe");
  const r = feed.consider(doc, el, [], baseSettings({ muteSloppy: false, authors: store }));
  assert.deepStrictEqual(r, ["author"]);
  // Soft block: a muted author's post is removed outright, with no stub shown.
  assert.ok(el.classList.contains("feedhacker-gone"), "muted author's post is hidden outright");
  assert.strictEqual(el.querySelector(".feedhacker-stub"), null, "no stub for a muted author");
  // allowed beats slop
  doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  el = feed.findPostContainers(doc)[0];
  store = authors.allow({}, "/in/jane", "Jane Doe");
  assert.strictEqual(feed.consider(doc, el, [], baseSettings({ authors: store })), null);
  assert.ok(!el.classList.contains("feedhacker-hidden"));
});

test("custom word filter hides a matching post", () => {
  const doc = makeDoc(feedHtml(post(`<div>big news about crypto today</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const settings = baseSettings({ muteSloppy: false, customCompiled: customfilters.compile({ words: ["crypto"] }) });
  const flags = feed.consider(doc, el, [], settings);
  assert.ok(flags && flags.some((f) => f.id === "custom"));
  assert.ok(el.classList.contains("feedhacker-hidden"));
});

test("Mute author button invokes the onMuteAuthor callback with the author info", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  let muted = null;
  feed.consider(doc, el, [], baseSettings({ onMuteAuthor: (info) => { muted = info; } }));
  const btn = el.querySelector(".feedhacker-stub .feedhacker-muteauthor");
  assert.ok(btn, "mute-author button present");
  btn.click();
  assert.ok(muted && /jane/i.test(muted.name || ""));
  assert.ok(/\/in\/jane$/.test(muted.url));
  assert.ok(el.classList.contains("feedhacker-dismissing"), "row is retired from the feed after muting");
});

test("Always show button allowlists the author and reveals the post", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  let allowed = null;
  feed.consider(doc, el, [], baseSettings({ onAllowAuthor: (info) => { allowed = info; } }));
  const btn = el.querySelector(".feedhacker-stub .feedhacker-allow");
  assert.ok(btn, "always-show button present");
  btn.click();
  assert.ok(allowed && /jane/i.test(allowed.name || ""), "author passed to onAllowAuthor");
  assert.strictEqual(el.dataset.feedhackerReveal, "1", "post marked revealed");
  assert.ok(!el.classList.contains("feedhacker-hidden"), "post no longer hidden");
  assert.strictEqual(el.querySelector(".feedhacker-stub"), null, "stub removed after allowing");
});

test("👍 confirm trains a positive AND retires the row (shows a checkmark)", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const seen = [];
  feed.consider(doc, el, [], baseSettings({ onFeedback: (f, label) => seen.push(label) }));
  const yes = el.querySelector(".feedhacker-stub .feedhacker-confirm");
  assert.ok(yes, "confirm button present");
  yes.click();
  assert.deepStrictEqual(seen, [1], "confirm trains a positive");
  assert.strictEqual(el.dataset.feedhackerConfirmedSlop, "1", "marked confirmed");
  assert.ok(el.classList.contains("feedhacker-dismissing"), "confirming AI slop now also retires the row");
  assert.strictEqual(el.dataset.feedhackerDismissed, "1", "and sticks (won't pop back)");
});

test("👍 confirm is idempotent — repeated clicks emit one positive", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const seen = [];
  feed.consider(doc, el, [], baseSettings({ onFeedback: (f, label) => seen.push(label) }));
  const yes = el.querySelector(".feedhacker-stub .feedhacker-confirm");
  yes.click(); yes.click(); yes.click();
  assert.deepStrictEqual(seen, [1], "only one positive training signal per post");
  assert.ok(yes.disabled, "confirm button is disabled after confirming");
});

test("Show anyway after confirming slop does not emit a contradictory negative", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const seen = [];
  feed.consider(doc, el, [], baseSettings({ onFeedback: (f, label) => seen.push(label) }));
  const stub = el.querySelector(".feedhacker-stub");
  stub.querySelector(".feedhacker-confirm").click();          // label 1
  stub.querySelector(".feedhacker-show").click();             // reveal — must NOT emit label 0
  assert.deepStrictEqual(seen, [1], "no contradictory false-positive after an explicit confirm");
});

test("Hide post retires the row without training or muting", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const seen = [];
  feed.consider(doc, el, [], baseSettings({ onFeedback: (f, label) => seen.push(label) }));
  const hide = el.querySelector(".feedhacker-stub .feedhacker-hidepost");
  assert.ok(hide, "hide-post button present");
  hide.click();
  assert.deepStrictEqual(seen, [], "hiding the post does not emit feedback");
  assert.ok(el.classList.contains("feedhacker-dismissing"), "row is retired from the feed after Hide post");
});

test("firstBodyLine strips the actor name and returns a trimmed opening line", () => {
  const line = feed.firstBodyLine("Feed post Jane Doe" + SLOP_BODY, "Jane Doe");
  assert.ok(!/^Jane Doe/.test(line), "author name stripped from the preview");
  assert.ok(/^Let’s be honest/.test(line), "starts at the post body");
  assert.ok(line.length <= 141, "capped to a single short line");
});

test("firstBodyLine keeps the body when there is no clean author name", () => {
  // getActor falls back to body text (with a colon) when no author link exists; that
  // must NOT be stripped, so the preview still shows the opening line.
  const junkName = "Let’s be honest: this isn’t just a job —";
  const line = feed.firstBodyLine("Feed post " + SLOP_BODY, junkName);
  assert.ok(/^Let’s be honest/.test(line), "body preserved when name is not a real name");
});

test("with no display toggles, the stub shows just the rule inline (no author, no sample)", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings());   // both toggles off
  const stub = el.querySelector(".feedhacker-stub");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-line1").textContent, "AI Slop", "line 1 is just the rule");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-author"), null, "no author when Show author is off");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-sample"), null, "no sample when Show sample is off");
  assert.strictEqual(stub.title, "AI slop", "reason is also on hover");
});

test("Show author puts the author inline with the rule on line 1", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings({ nameNames: true }));
  const stub = el.querySelector(".feedhacker-stub");
  assert.ok(/Jane Doe/.test(stub.querySelector(".feedhacker-stub-author").textContent), "author shown");
  assert.ok(/AI Slop/.test(stub.querySelector(".feedhacker-stub-line1").textContent), "rule shown inline with the author");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-sample"), null, "no sample without Show sample");
});

test("Show sample adds a sample of the post on the second line", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings({ nameNames: true, nameSample: true }));
  const stub = el.querySelector(".feedhacker-stub");
  assert.ok(stub.classList.contains("feedhacker-stub-multi"), "two-line layout");
  assert.ok(/Jane Doe/.test(stub.querySelector(".feedhacker-stub-author").textContent), "line 1 has the author");
  assert.ok(/AI Slop/.test(stub.querySelector(".feedhacker-stub-line1").textContent), "line 1 has the rule");
  assert.ok(/Let’s be honest/.test(stub.querySelector(".feedhacker-stub-sample").textContent), "line 2 is the post sample");
});

test("Show sample without Show author: rule on line 1, sample on line 2, no author", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings({ nameNames: false, nameSample: true }));
  const stub = el.querySelector(".feedhacker-stub");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-author"), null, "no author line");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-line1").textContent, "AI Slop", "line 1 is the rule");
  assert.ok(/Let’s be honest/.test(stub.querySelector(".feedhacker-stub-sample").textContent), "line 2 is the sample");
});

test("non-slop stub (Promoted) shows the rule and, with Show author off, no author/sample", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/acme">Acme</a><span>Promoted</span><div>buy things now</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings({ muteSloppy: false, mutePromoted: true }));
  const stub = el.querySelector(".feedhacker-stub");
  assert.ok(stub, "promoted post collapsed");
  assert.ok(/Promoted/.test(stub.querySelector(".feedhacker-stub-line1").textContent), "shows the Promoted rule");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-author"), null, "no author with Show author off");
  assert.strictEqual(stub.querySelector(".feedhacker-stub-sample"), null, "no sample with Show sample off");
});

test("reset() clears the stashed preview", () => {
  const doc = makeDoc(feedHtml(post(`<a href="/in/jane">Jane Doe</a><div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  feed.consider(doc, el, [], baseSettings());
  assert.ok(el.dataset.feedhackerPreview, "preview stashed");
  feed.reset(doc);
  assert.strictEqual(el.dataset.feedhackerPreview, undefined);
});

