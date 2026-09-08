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
