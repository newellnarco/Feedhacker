"use strict";
// Unit: the session-handoff contract must stay intact.
//
// SESSION-STATE.md is how one session hands off to the next — a session has no other memory of
// what came before. The failure mode is silent: a section gets renamed or dropped, a later
// session doesn't find the open items, and work is either redone or lost. These assertions are
// deliberately structural (sections exist, the open-items table is real, both ends are wired in
// CLAUDE.md) — they cannot judge whether the contents are *current*, which is what the §4
// close-out checklist is for.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const state = fs.readFileSync(path.join(ROOT, "SESSION-STATE.md"), "utf8");
const claude = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");

const SECTIONS = [
  "## 1. Open items",
  "## 2. Current state",
  "## 3. Startup checklist",
  "## 4. Close-out checklist",
  "## 5. Session log",
  "## 6. Key facts",
];

test("SESSION-STATE.md keeps every section of the handoff contract", () => {
  for (const h of SECTIONS) {
    assert.ok(state.includes(h), `SESSION-STATE.md is missing "${h}"`);
  }
});

test("the sections appear in the documented order", () => {
  const positions = SECTIONS.map((h) => state.indexOf(h));
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepStrictEqual(positions, sorted,
    "open items must come first — a new session reads top-down");
});

test("Open items is a real table with rows, not a leftover heading", () => {
  const start = state.indexOf("## 1. Open items");
  const body = state.slice(start, state.indexOf("## 2. Current state"));
  assert.match(body, /\|\s*#\s*\|/, "the open-items table header is present");
  const rows = body.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
  assert.ok(rows.length >= 1, "at least one open item, or the row format has drifted");
  // Every row must say who it is waiting on — an unowned item is how things stall.
  for (const r of rows) {
    assert.ok(r.split("|").length >= 5, `open item row is missing a column: ${r.slice(0, 60)}`);
  }
});

test("the Session log has at least one dated entry", () => {
  const log = state.slice(state.indexOf("## 5. Session log"), state.indexOf("## 6. Key facts"));
  assert.match(log, /^### \d{4}-\d{2}-\d{2}/m, "entries are '### YYYY-MM-DD — summary'");
});

test("CLAUDE.md wires BOTH ends of the handoff, not just the start", () => {
  assert.match(claude, /START every session there/i, "the start rule must be explicit");
  assert.match(claude, /END every session there/i,
    "the close-out rule must be explicit — a start-only rule is how the file goes stale");
  assert.match(claude, /SESSION-STATE\.md/);
});

test("the archive is clearly marked as not current", () => {
  const i = state.indexOf("## Archive");
  assert.ok(i > state.indexOf("## 6. Key facts"), "the archive sits below the live sections");
  assert.match(state.slice(i, i + 400), /Nothing below is current/i,
    "a reader must not mistake archived state for current state");
});
