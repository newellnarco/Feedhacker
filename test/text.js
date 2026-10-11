"use strict";
// Read a tracked text file as it is committed: LF line endings.
//
// `.gitattributes` says `* text=auto`, so on Windows with `core.autocrlf=true` Git checks text files
// out with CRLF. Tests that parse a workflow or Markdown file with "\n" patterns then fail on that
// machine while CI (Linux, LF) passes, so a red local run is not evidence of anything (FH-075).
// Any test that parses a repository text file reads it through here.
const fs = require("node:fs");

function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

module.exports = { readText };
