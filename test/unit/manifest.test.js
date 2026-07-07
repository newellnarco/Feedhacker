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

test("base manifest stays store-clean: no nativeMessaging, no key", () => {
  // These are injected only into the sideload builds by scripts/build.mjs so the Chrome
  // Web Store package keeps a minimal permission set (store installs auto-update).
  assert.ok(!(manifest.permissions || []).includes("nativeMessaging"),
    "nativeMessaging must not be in the store manifest — it's a sideload-only permission");
  assert.strictEqual(manifest.key, undefined, "the manifest `key` is sideload-only; keep it out of the store manifest");
});
