"use strict";
// Integration: Solo mode must explain itself and offer a way out (FH-051).
//
// Solo hides EVERY post that isn't a soloed kind, so a single green "S" in the popup can
// empty an entire feed. The maintainer hit exactly this and reported it as the AI-slop model
// "filtering almost 100% out" — the stub said only "Filtered out", which is indistinguishable
// from a runaway scorer, and the sole exit was knowing to reopen the popup.
const test = require("node:test");
const assert = require("node:assert");
const { feed, filters, scorer, makeDoc } = require("../helper");

function baseSettings(over) {
  return Object.assign({}, filters.DEFAULTS, { slopWeights: scorer.defaultWeights() }, over || {});
}
const HUMAN = "Fixed a caching bug this morning, tests pass, shipping the patch after lunch.";
function feedHtml(b) { return `<!doctype html><html><body><main><div id="feed">${b}</div></main></body></html>`; }
let urn = 0;
function post(text) {
  return `<div class="post" data-urn="urn:li:activity:${++urn}"><h2>Feed post</h2><div>${text}</div></div>`;
}
function humanPosts(n) { let s = ""; for (let i = 0; i < n; i++) s += post(HUMAN + " #" + i); return s; }

// Solo on "promoted": an ordinary human post matches nothing soloed, so it is hidden.
function soloSettings(over) {
  return baseSettings(Object.assign({ soloPromoted: true, onClearSolo() {} }, over || {}));
}

test("a post hidden by solo mode says SO on the stub, and names what is being shown", () => {
  const doc = makeDoc(feedHtml(post(HUMAN)));
  feed.scan(doc, [], soloSettings());
  const stub = doc.querySelector(".feedhacker-stub");
  assert.ok(stub, "the post is hidden");
  assert.match(stub.textContent, /Solo mode/,
    'the stub must name solo mode — a bare "Filtered out" reads as an over-aggressive model');
  assert.match(stub.textContent, /showing only Promoted posts/,
    "and name the soloed kind, so the user knows which toggle to undo");
});

test("the solo stub carries a one-click way back to the whole feed", () => {
  const doc = makeDoc(feedHtml(post(HUMAN)));
  feed.scan(doc, [], soloSettings());
  const out = doc.querySelector('.feedhacker-stub [data-fh-act="unsolo"]');
  assert.ok(out, "solo stub offers an exit control");
  assert.match(out.textContent, /Show\s*everything/);
});

test("clicking it calls onClearSolo exactly once", () => {
  const doc = makeDoc(feedHtml(post(HUMAN)));
  let calls = 0;
  feed.scan(doc, [], soloSettings({ onClearSolo() { calls++; } }));
  doc.querySelector('[data-fh-act="unsolo"]').dispatchEvent(
    new doc.defaultView.MouseEvent("click", { bubbles: true, cancelable: true })
  );
  assert.strictEqual(calls, 1, "the exit button must reach the glue that clears the solo keys");
});

test("the GROUP row offers the exit too — a soloed feed is nothing but group rows", () => {
  // This is the case in the maintainer's screenshot: every visible row was a group summary,
  // so an exit that only existed on per-post stubs would have been unreachable.
  const doc = makeDoc(feedHtml(humanPosts(5)));
  const s = soloSettings();
  feed.scan(doc, [], s);
  feed.groupRuns(doc, s);
  const group = doc.querySelector(".feedhacker-stub.feedhacker-group");
  assert.ok(group, "the run folds into a group row");
  assert.match(group.textContent, /Solo mode/, "the group row names the cause");
  assert.ok(group.querySelector('[data-fh-act="unsolo"]'), "and carries the exit");
});

test("no exit control is offered when solo is off", () => {
  // Ordinary AI-slop hiding must not sprout a "Show everything" button.
  const SLOP =
    "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. " +
    "Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.";
  const doc = makeDoc(feedHtml(post(SLOP)));
  feed.scan(doc, [], baseSettings({ onClearSolo() {} }));
  assert.strictEqual(doc.querySelector('[data-fh-act="unsolo"]'), null);
});

test("the exit is omitted when the glue provides no handler", () => {
  const doc = makeDoc(feedHtml(post(HUMAN)));
  feed.scan(doc, [], baseSettings({ soloPromoted: true }));   // no onClearSolo
  assert.ok(doc.querySelector(".feedhacker-stub"), "still hidden");
  assert.strictEqual(doc.querySelector('[data-fh-act="unsolo"]'), null, "no dead button");
});


// --- FH-056: an author mute must not outrank solo -------------------------------------------
//
// Found on a real 63-post feed capture. Solo was set to Hiring and EVERY post was hidden.
// Exactly one post qualified — a genuine ad, "Disney is hiring! Hundreds and hundreds of posted
// roles" — and its author was muted, so `consider()` hid it in the author block and returned
// before solo was ever consulted. The user saw an empty feed and concluded the hiring filter
// was broken, when in fact it had identified the one post they wanted and the other setting
// then threw it away.
//
// In solo mode the soloed kinds ARE the whitelist, so a muted author's matching post is
// something the user has positively asked for; their non-matching posts are still hidden by
// solo itself, so the mute loses nothing.

const HIRING = "Disney is hiring! Hundreds and hundreds of posted roles, apply here.";
function mutedAuthorPost(text, slug, name) {
  return `<div class="post" data-urn="urn:li:activity:${++urn}"><h2>Feed post</h2>` +
    `<a href="https://www.linkedin.com/in/${slug}/">${name}</a><div>${text}</div></div>`;
}
function mutedSettings(slug, over) {
  const { authors } = require("../helper");
  const key = authors.keyFor({ name: "Richard King", url: `https://www.linkedin.com/in/${slug}/` });
  const muted = {}; muted[key] = 1;
  return baseSettings(Object.assign({
    authors: { muted, allowed: {} }, authorMutesActive: true, onClearSolo() {}
  }, over || {}));
}

test("solo SHOWS a muted author's post when it matches the soloed kind (FH-056)", () => {
  const doc = makeDoc(feedHtml(
    mutedAuthorPost(HIRING, "richard-king", "Richard King") + post(HUMAN)
  ));
  feed.scan(doc, [], mutedSettings("richard-king", { soloHiring: true }));

  const rk = doc.querySelectorAll(".post")[0];
  assert.notStrictEqual(rk.dataset.feedhackerHidden, "1",
    "the one genuine hiring post must survive — solo is what the user asked for");
  assert.strictEqual(doc.querySelectorAll(".post")[1].dataset.feedhackerHidden, "1",
    "and an ordinary post is still hidden by solo");
});

test("solo still hides a muted author's post that does NOT match the soloed kind (FH-056)", () => {
  // The mute loses nothing: solo itself removes everything off-category.
  const doc = makeDoc(feedHtml(
    mutedAuthorPost("Shoot your shot has become the bane of recruiters everywhere.", "richard-king", "Richard King") +
    post(HUMAN)
  ));
  feed.scan(doc, [], mutedSettings("richard-king", { soloHiring: true }));
  assert.strictEqual(doc.querySelectorAll(".post")[0].dataset.feedhackerHidden, "1",
    "off-category chatter from a muted author stays hidden");
});

test("with NO solo active, an author mute still wins outright (FH-056 must not weaken mute)", () => {
  const doc = makeDoc(feedHtml(
    mutedAuthorPost(HIRING, "richard-king", "Richard King") + post(HUMAN)
  ));
  feed.scan(doc, [], mutedSettings("richard-king", { muteHiring: false }));

  const rk = doc.querySelectorAll(".post")[0];
  assert.strictEqual(rk.dataset.feedhackerHidden, "1", "mute mode: a muted author is gone");
  assert.match(rk.dataset.feedhackerReasons || "", /Muted author/,
    "and it is recorded as an author mute, not as a kind filter");
});
