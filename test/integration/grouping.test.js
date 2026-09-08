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
// Each post carries its own LinkedIn activity URN, the way a real feed post does. FeedHacker
// keys "already judged" on that URN (falling back to a text hash), so without distinct URNs a
// run of identical-text fixtures is ONE post to it — which is the correct reading of identical
// markup, but not what these fixtures mean to express.
let urnSeq = 0;
function post2(inner) { return `<div class="post" data-urn="urn:li:activity:${++urnSeq}"><h2>Feed post</h2>${inner}</div>`; }
function slopPosts(n) { let s = ""; for (let i = 0; i < n; i++) s += post2(`<div>${SLOP}</div>`); return s; }

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

test("an existing group row breaks a run — hidden posts on either side don't merge across it", () => {
  const doc = makeDoc(feedHtml(slopPosts(7)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  const posts = feed.findPostContainers(doc);
  // Simulate a group already occupying posts[2..4] (head + two folded members),
  // with ungrouped hidden stubs on both sides (posts 0,1 and 5,6).
  posts[2].dataset.feedhackerGrouphead = "G";
  [3, 4].forEach((i) => {
    const st = posts[i].querySelector(".feedhacker-stub"); if (st) st.remove();
    posts[i].classList.remove("feedhacker-hidden"); posts[i].classList.add("feedhacker-gone");
    posts[i].dataset.feedhackerGroup = "G";
  });

  feed.groupRuns(doc, s);

  assert.ok(!posts[0].dataset.feedhackerGrouphead, "posts before the group are NOT merged across it");
  assert.strictEqual(posts[2].dataset.feedhackerGrouphead, "G", "the existing group head is untouched");
  // The 2-post runs on each side stay as individual stubs (below the group minimum).
  [0, 1, 5, 6].forEach((i) => assert.ok(posts[i].querySelector(".feedhacker-stub") && !posts[i].querySelector(".feedhacker-group"), `post ${i} kept its own stub`));
});

test("recompute re-scores without polluting the calibration observations", () => {
  const observed = [];
  const s = baseSettings({ groupHiddenRuns: false, onSlopObserve: (f) => observed.push(f) });
  const doc = makeDoc(feedHtml(slopPosts(2)));
  feed.scan(doc, [], s);                    // observes each post once, at its real first scan
  const before = observed.length;
  assert.ok(before >= 2, "posts observed during the initial scan");

  feed.recompute(doc, [], s);
  assert.strictEqual(observed.length, before, "recompute does not re-observe already-scored posts");
  assert.strictEqual(typeof s.onSlopObserve, "function", "the observer is restored after recompute");
});

test("recompute re-scores from stored features, not the collapsed post's stub text", () => {
  const doc = makeDoc(feedHtml(post(`<div class="body">${SLOP}</div>`)));
  const s = baseSettings({ groupHiddenRuns: false });
  feed.scan(doc, [], s);
  const el = feed.findPostContainers(doc)[0];
  assert.ok(el.classList.contains("feedhacker-hidden") && el.dataset.feedhackerFeatures, "hidden with features stored");

  // Simulate the browser reality where a collapsed post's visible text is now the stub UI:
  // overwrite the body with plainly-human text. recompute must ignore this and use the stored
  // slop features, so the post STAYS hidden.
  el.querySelector(".body").textContent = "totally normal human sentence about lunch.";
  feed.recompute(doc, [], s);
  assert.ok(el.classList.contains("feedhacker-hidden"), "still hidden — re-scored from stored features, not live text");
});

test("'Show all' survives a preserving reset (settings change) and isn't silently re-folded", () => {
  const doc = makeDoc(feedHtml(slopPosts(4)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  const posts = feed.findPostContainers(doc);
  posts[0].querySelector('[data-fh-act="ungroup"]').click();   // expand → marks the run ungrouped

  feed.reset(doc, true);   // a preserving reapply (e.g. an unrelated settings change)
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  assert.strictEqual(doc.querySelector(".feedhacker-group"), null, "expanded run is not re-folded by a preserving reset");

  feed.reset(doc);         // a FULL reset clears the preference
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  assert.ok(doc.querySelector(".feedhacker-group"), "after a full reset the run can group again");
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

// --- FH-044: a folded run used to drop EVERY per-post control, so on a slop-heavy feed
// (where runs are the common case) the AI-slop splat was unreachable — the user only ever
// saw "N posts hidden". The group row now carries the splat, and it trains on the whole run.
function trainingSettings(over) {
  const labels = [];
  const verdicts = [];
  const s = baseSettings(Object.assign({ groupHiddenRuns: true }, over || {}));
  s.onFeedback = (feats, label) => labels.push(label);
  s.onSlopVerdict = (id, label) => verdicts.push(label);
  s.onSlopDecision = () => {};
  return { s, labels, verdicts };
}

test("a group summary row carries the AI-slop splat", () => {
  const doc = makeDoc(feedHtml(slopPosts(4)));
  const { s } = trainingSettings();
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);

  const group = doc.querySelector(".feedhacker-stub.feedhacker-group");
  const splat = group.querySelector('[data-fh-act="confirm-group"]');
  assert.ok(splat, "the group row exposes an AI-slop confirm control");
  assert.match(splat.title, /confirm all 4/, "its title says how many posts it covers");
  assert.ok(group.querySelector('[data-fh-act="ungroup"]'), "…alongside Show all");
});

test("confirming a group trains on every slop member, once, and retires the run", () => {
  const doc = makeDoc(feedHtml(slopPosts(4)));
  const { s, labels, verdicts } = trainingSettings();
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);

  const splat = doc.querySelector('[data-fh-act="confirm-group"]');
  splat.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));

  assert.deepStrictEqual(labels, [1, 1, 1, 1], "one positive signal per slop post in the run");
  assert.deepStrictEqual(verdicts, [1, 1, 1, 1], "…and one logged verdict per post");
  feed.findPostContainers(doc).forEach((p, i) => {
    assert.strictEqual(p.dataset.feedhackerConfirmedSlop, "1", `post ${i} marked confirmed`);
    assert.strictEqual(p.dataset.feedhackerDismissed, "1", `post ${i} retired from the feed`);
  });

  // Idempotent: the button is spent, and a second confirm can't double-train.
  assert.strictEqual(splat.disabled, true, "the splat is disabled once confirmed");
  feed.groupRuns(doc, s);
  const again = doc.querySelector('[data-fh-act="confirm-group"]');
  if (again) again.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
  assert.deepStrictEqual(labels, [1, 1, 1, 1], "no second round of training signals");
});

test("a group with nothing trainable in it shows no splat", () => {
  // Promoted posts are a deterministic filter: hidden, but nothing for the model to learn.
  const promo = (i) => post(`<a href="/company/acme">Acme</a><span>Promoted</span><div>buy thing ${i}</div>`);
  const doc = makeDoc(feedHtml([0, 1, 2].map(promo).join("")));
  const { s } = trainingSettings({ muteSloppy: false, mutePromoted: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);

  const group = doc.querySelector(".feedhacker-stub.feedhacker-group");
  assert.ok(group, "the promoted run still folds");
  assert.strictEqual(group.querySelector('[data-fh-act="confirm-group"]'), null, "but there is no slop to confirm");
  assert.ok(group.querySelector('[data-fh-act="ungroup"]'), "Show all is still offered");
});

// FH-047: hidden posts cluster on a real feed, so an uncapped run collapsed a whole screen
// into a single "27 posts hidden" line — which reads as "FeedHacker ate my feed" even when
// the hidden share is modest, and put every post behind one Show-all.
test("a long run breaks into several rows instead of one giant one", () => {
  const doc = makeDoc(feedHtml(slopPosts(20)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);

  const rows = [...doc.querySelectorAll(".feedhacker-stub.feedhacker-group")];
  assert.ok(rows.length > 1, `20 hidden posts must not collapse to one row (got ${rows.length})`);
  for (const row of rows) {
    const n = Number((row.textContent.match(/(\d+) posts hidden/) || [])[1]);
    assert.ok(n <= 8, `no row may stand for more than 8 posts (got ${n})`);
    assert.ok(row.querySelector('[data-fh-act="ungroup"]'), "each row keeps its own Show all");
  }
  // Every hidden post is still accounted for by exactly one row.
  const claimed = rows.reduce((a, r) => a + Number((r.textContent.match(/(\d+) posts hidden/) || [])[1]), 0);
  assert.strictEqual(claimed, 20, "the rows account for every hidden post, once");
});

test("Show all on one row expands only that row's posts", () => {
  const doc = makeDoc(feedHtml(slopPosts(20)));
  const s = baseSettings({ groupHiddenRuns: true });
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);

  const before = doc.querySelectorAll(".feedhacker-stub.feedhacker-group").length;
  doc.querySelector('.feedhacker-group [data-fh-act="ungroup"]')
     .dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
  const after = doc.querySelectorAll(".feedhacker-stub.feedhacker-group").length;
  assert.strictEqual(after, before - 1, "the other rows stay folded");
});
