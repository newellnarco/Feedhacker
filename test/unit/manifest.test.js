"use strict";
// Guard the manifest against Chrome Web Store upload limits and our review decisions,
// so a regression fails CI here instead of at the Dashboard upload step.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "manifest.json"), "utf8"));

test("description is within the Web Store's 132-character limit", () => {
  assert.ok(manifest.description, "description is required");
  assert.ok(
    manifest.description.length <= 132,
    `description is ${manifest.description.length} chars (max 132): ${manifest.description}`
  );
});

test("name is within the Web Store's 45-character limit", () => {
  assert.ok(manifest.name && manifest.name.length <= 45, `name too long: ${manifest.name}`);
});

test("host permission stays narrowed (no broad https://*/*)", () => {
  const hosts = [].concat(manifest.host_permissions || [], manifest.optional_host_permissions || []);
  assert.ok(!hosts.includes("https://*/*"), "broad https://*/* host permission would slow store review");
});

test("no self-hosted update_url (the Web Store manages updates)", () => {
  assert.strictEqual(manifest.update_url, undefined, "remove update_url before publishing to the store");
});
