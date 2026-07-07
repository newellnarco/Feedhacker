"use strict";
// Windows PowerShell 5.1 reads a UTF-8-without-BOM .ps1 as the system ANSI code page
// (Windows-1252), NOT UTF-8. A UTF-8 em-dash ("-" U+2014) is bytes E2 80 94, and byte
// 0x94 in Windows-1252 is a smart closing double-quote, which PowerShell treats as a
// STRING TERMINATOR -- so a script with an em-dash inside a "..." string fails to parse
// ("Unexpected token", "missing terminator"). Keep the installer scripts pure ASCII so
// they parse identically on Windows PowerShell 5.1 and PowerShell 7.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "..", "..", "installer", "windows");
const files = fs.readdirSync(dir).filter((f) => /\.(ps1|bat|cmd)$/i.test(f));

test("there are installer scripts to check", () => {
  assert.ok(files.length > 0, "expected .ps1/.bat scripts under installer/windows");
});

for (const f of files) {
  test(`installer/windows/${f} is pure ASCII (Windows PowerShell safe)`, () => {
    const buf = fs.readFileSync(path.join(dir, f));
    const bad = [];
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 0x7f) { bad.push(`0x${buf[i].toString(16)} @${i}`); if (bad.length >= 5) break; }
    }
    assert.strictEqual(bad.length, 0,
      `${f} has non-ASCII bytes (${bad.join(", ")}) -- use ASCII (e.g. '-' not an em-dash, '...' not an ellipsis)`);
  });
}
