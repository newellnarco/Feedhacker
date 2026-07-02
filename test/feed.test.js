"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, authors, customfilters, makeDoc } = require("./helper");

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

test("scanComments collapses an AI-slop comment", () => {
  const comment =
    `<div class="comment"><img src="x"><a href="/in/jane">Jane</a>` +
    `<div componentkey="comment-commentary_1">${SLOP_BODY}</div></div>`;
  const doc = makeDoc(feedHtml(post(`<div>normal body</div>${comment}`)));
  const hidden = feed.scanComments(doc, [], baseSettings({ hideSlopComments: true }));
  assert.strictEqual(hidden, 1);
  assert.ok(doc.querySelector(".comment").classList.contains("feedhacker-hidden"));
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
  assert.ok(el.classList.contains("feedhacker-hidden"));
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
});

test("👍 confirm trains a positive without un-hiding", () => {
  const doc = makeDoc(feedHtml(post(`<div>${SLOP_BODY}</div>`)));
  const el = feed.findPostContainers(doc)[0];
  const seen = [];
  feed.consider(doc, el, [], baseSettings({ onFeedback: (f, label) => seen.push(label) }));
  const yes = el.querySelector(".feedhacker-stub .feedhacker-confirm");
  assert.ok(yes, "confirm button present");
  yes.click();
  assert.deepStrictEqual(seen, [1]);
  assert.ok(el.classList.contains("feedhacker-hidden"), "still hidden after confirm");
});

test("digest groups consecutive hidden posts into one summary bar", () => {
  const list = post(`<div>${SLOP_BODY}</div>`) + post(`<div>${SLOP_BODY}</div>`) + post("<div>a normal human post</div>");
  const doc = makeDoc(feedHtml(list));
  feed.scan(doc, [], baseSettings({ digest: true }));
  const summaries = doc.querySelectorAll(".feedhacker-digest-summary");
  assert.strictEqual(summaries.length, 1, "one summary for the run of two");
  assert.ok(/2 low-signal posts hidden/.test(summaries[0].textContent));
  assert.strictEqual(doc.querySelectorAll(".feedhacker-digested").length, 2);
});
