"use strict";
// Unit: the docs-only gate in ci.yml's `changes` job, run as the real shell it is.
//
// The gate decides whether the three test tiers run at all, so a wrong answer either spends minutes
// on a docs edit or, worse, skips the tests on a change they would have caught. Two Markdown files
// are read by tests (test/unit/session-state.test.js reads CLAUDE.md and SESSION-STATE.md), so a
// change to either must count as code; #122's first version of the gate skipped them, and #121 had
// been written to keep them in.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { readText } = require("../text");

const ci = readText(path.join(__dirname, "..", "..", ".github", "workflows", "ci.yml"));
// The decision is the `if [ -n "$files" ] … fi` statement (possibly continued over lines).
const m = ci.match(/^\s*(if \[ -n "\$files" \][\s\S]*?; fi)$/m);

function gate(files) {
  const script = `files=$1\n${m[1]}\necho "$code"`;
  return execFileSync("bash", ["-c", script, "gate", files.join("\n")], { encoding: "utf8" }).trim();
}

test("ci.yml still carries the docs-only decision this test drives", () => {
  assert.ok(m, "could not find the `if [ -n \"$files\" ] … fi` gate in ci.yml");
});

test("docs-only changes skip the tiers", () => {
  assert.strictEqual(gate(["docs/index.html"]), "false");
  assert.strictEqual(gate(["README.md", "KNOWN_ISSUES.md", "docs/support.html"]), "false");
  assert.strictEqual(gate(["LICENSE"]), "false");
});

test("Markdown that a test reads counts as code (CLAUDE.md, SESSION-STATE.md)", () => {
  assert.strictEqual(gate(["SESSION-STATE.md"]), "true");
  assert.strictEqual(gate(["CLAUDE.md"]), "true");
  assert.strictEqual(gate(["README.md", "CLAUDE.md"]), "true", "one tested file among docs still runs CI");
});

test("code, nested Markdown and an empty or unreadable diff all run the tiers", () => {
  assert.strictEqual(gate(["src/feed.ts"]), "true");
  assert.strictEqual(gate(["README.md", "src/feed.ts"]), "true");
  assert.strictEqual(gate(["store/release-notes.md"]), "true", "store/*.md is read by tests and is not root Markdown");
  assert.strictEqual(gate([]), "true", "absent is not zero: an unreadable diff runs everything");
});
