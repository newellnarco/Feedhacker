"use strict";
// Unit: tests that parse repository text files see LF, whatever the checkout's line endings (FH-075).
//
// On a Windows checkout with `core.autocrlf=true`, ci-gate, release-gates and store-notes failed (5
// tests) on an unchanged `main` while CI passed: they parse ci.yml, release.yml and the store Markdown
// with "\n" patterns, and the working copy had CRLF. CI alone cannot catch that, because its runner
// checks out LF. So this file feeds CRLF in directly, and pins the three suites to the reader.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readText } = require("../text");

test("readText turns a CRLF checkout into the committed LF text", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-text-"));
  try {
    const file = path.join(dir, "ci.yml");
    fs.writeFileSync(file, "on:\r\n  push:\r\n\r\njobs:\r\n  unit:\r\n", "utf8");
    const text = readText(file);
    assert.ok(!text.includes("\r"), "no CR survives");
    assert.equal(text, "on:\n  push:\n\njobs:\n  unit:\n");
    // The exact shape ci-gate.test.js looks for, which a CRLF copy does not match.
    assert.ok(text.includes("\non:\n") || text.startsWith("on:\n"));
    assert.ok(!fs.readFileSync(file, "utf8").includes("\njobs:\n"), "the raw CRLF read is what used to fail");
    assert.ok(text.includes("\njobs:\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an LF file is returned unchanged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh-text-"));
  try {
    const file = path.join(dir, "a.md");
    fs.writeFileSync(file, "# A\n\nline\n", "utf8");
    assert.equal(readText(file), "# A\n\nline\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the suites that parse workflows and store Markdown read through readText, not raw fs", () => {
  for (const name of ["ci-gate.test.js", "release-gates.test.js", "store-notes.test.js"]) {
    const src = fs.readFileSync(path.join(__dirname, name), "utf8");
    assert.match(src, /require\("\.\.\/text"\)/, `${name} uses test/text.js`);
    assert.doesNotMatch(src, /readFileSync\(/, `${name} does not read files raw`);
  }
});
