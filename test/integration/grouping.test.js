"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

function baseSettings(over) {
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() }, over || {});
}
const SLOP =
  "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
  "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
const HUMAN = "Fixed a caching bug this morning, tests pass, shipping the patch after lunch.";

function feedHtml(bodyHtml) {
  return `<!doctype html><html><body><main><div id="feed">${bodyHtml}</div></main></body></html>`;
}
function post(inner) { return `<div class="post"><h2>Feed post</h2>${inner}</div>`; }
function slopPosts(n) { let s = ""; for (let i = 0; i < n; i++) s += post(`<div>${SLOP}</div>`); return s; }

test("a run of 3+ consecutive hidden posts folds into one summary row", () => {
  const doc = makeDoc(feedHtml(slopPosts(4)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  const posts = feed.findPostContainers(doc);

  const head = posts[0];
  const groupStub = head.querySelector(".feedhacker-stub.feedhacker-group");
  assert.ok(groupStub, "the run's first post shows a group summary stub");
  assert.match(groupStub.textContent, /4 posts hidden/, "summary reports the run size");
  assert.ok(groupStub.querySelector('[data-fh-act="ungroup"]'), "group stub has a Show-all control");

  for (let i = 1; i < 4; i++) {
    assert.ok(posts[i].classList.contains("feedhacker-gone"), `member ${i} is folded away`);
    assert.strictEqual(posts[i].querySelector(".feedhacker-stub"), null, `member ${i} has no stub`);
  }
});

test("a run shorter than the minimum is NOT grouped", () => {
  const doc = makeDoc(feedHtml(slopPosts(2)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  const posts = feed.findPostContainers(doc);
  assert.strictEqual(doc.querySelector(".feedhacker-group"), null, "no grouping under the minimum");
  posts.forEach((p) => assert.ok(p.querySelector(".feedhacker-stub"), "each keeps its own stub"));
});

test("a visible post breaks the run", () => {
  // 2 slop, a human post, then 3 slop → only the trailing run of 3 groups.
  const doc = makeDoc(feedHtml(slopPosts(2) + post(`<div>${HUMAN}</div>`) + slopPosts(3)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  const posts = feed.findPostContainers(doc);
  assert.ok(!posts[0].querySelector(".feedhacker-group"), "leading run of 2 not grouped");
  assert.ok(!posts[2].classList.contains("feedhacker-hidden"), "human post stays visible");
  assert.ok(posts[3].querySelector(".feedhacker-stub.feedhacker-group"), "trailing run of 3 grouped");
});

test("Show all expands a group back to individual stubs and doesn't re-fold", () => {
  const doc = makeDoc(feedHtml(slopPosts(4)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  const posts = feed.findPostContainers(doc);

  posts[0].querySelector('[data-fh-act="ungroup"]').click();
  posts.forEach((p, i) => {
    assert.ok(p.classList.contains("feedhacker-hidden"), `post ${i} hidden again`);
    assert.ok(p.querySelector(".feedhacker-stub") && !p.querySelector(".feedhacker-group"), `post ${i} back to an individual stub`);
  });

  feed.groupRuns(doc, s);   // should respect the user's expand
  assert.strictEqual(doc.querySelector(".feedhacker-group"), null, "expanded run is not re-folded");
});

test("grouping is off when the setting is disabled", () => {
  const doc = makeDoc(feedHtml(slopPosts(4)));
  const s = baseSettings({ groupHiddenRuns: false });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  assert.strictEqual(doc.querySelector(".feedhacker-group"), null, "no grouping when disabled");
});

test("recompute reveals posts the loosened model no longer flags, without rebuilding surviving stubs", () => {
  const doc = makeDoc(feedHtml(slopPosts(2)));
  const s = baseSettings({ groupHiddenRuns: false });
  feed.scan(doc, [], s);
  const posts = feed.findPostContainers(doc);
  assert.ok(posts[0].classList.contains("feedhacker-hidden") && posts[1].classList.contains("feedhacker-hidden"));

  // A still-slop pass must keep the SAME stub node (no teardown → no swallowed clicks).
  const stubBefore = posts[0].querySelector(".feedhacker-stub");
  feed.recompute(doc, [], s);
  assert.strictEqual(posts[0].querySelector(".feedhacker-stub"), stubBefore, "unchanged stub is not rebuilt");

  // Loosen the model so nothing scores as slop → recompute reveals them.
  s.slopThreshold = 0.999;
  feed.recompute(doc, [], s);
  posts.forEach((p, i) => {
    assert.ok(!p.classList.contains("feedhacker-hidden"), `post ${i} revealed`);
    assert.strictEqual(p.querySelector(".feedhacker-stub"), null, `post ${i} stub removed`);
  });
});
