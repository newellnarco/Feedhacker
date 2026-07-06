"use strict";
// System (build): the packaged output must be a complete, loadable extension. Guards
// against the build silently dropping a file the manifest references (the class of
// bug the old bash build could hit) and against a corrupt distribution zip.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { EXT, ROOT } = require("./helper");

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

test("every file the manifest references is present in dist/feedhacker", () => {
  assert.ok(fs.existsSync(path.join(EXT, "manifest.json")), "run `npm run build` first");
  const referenced = new Set(["manifest.json"]);
  for (const cs of manifest.content_scripts || []) {
    for (const j of cs.js || []) referenced.add(j);
    for (const c of cs.css || []) referenced.add(c);
  }
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker);
  if (manifest.action?.default_popup) referenced.add(manifest.action.default_popup);
  if (manifest.options_ui?.page) referenced.add(manifest.options_ui.page);
  for (const war of manifest.web_accessible_resources || []) {
    for (const r of war.resources || []) referenced.add(r);
  }
  for (const size of Object.values(manifest.icons || {})) referenced.add(size);

  const missing = [...referenced].filter((f) => !fs.existsSync(path.join(EXT, f)));
  assert.deepStrictEqual(missing, [], `dist/feedhacker is missing: ${missing.join(", ")}`);
});

test("every script referenced by the packaged HTML pages ships in dist/feedhacker", () => {
  // The manifest doesn't list page scripts (popup.js, options.js, update.js) — they're
  // pulled in by <script src> in the HTML. Guard those too, so dropping one from the
  // build's file list is caught instead of shipping a 404 at runtime.
  const missing = [];
  for (const page of ["popup.html", "options.html"]) {
    const p = path.join(EXT, page);
    if (!fs.existsSync(p)) { missing.push(page); continue; }
    const html = fs.readFileSync(p, "utf8");
    const re = /<script[^>]+src=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) {
      const src = m[1];
      if (!/^https?:/i.test(src) && !fs.existsSync(path.join(EXT, src))) missing.push(`${page} -> ${src}`);
    }
  }
  assert.deepStrictEqual(missing, [], `packaged HTML references missing files: ${missing.join(", ")}`);
});

function assertPkZip(zip) {
  assert.ok(fs.existsSync(zip), `expected ${zip} — run \`npm run build\``);
  const head = Buffer.alloc(4);
  const fd = fs.openSync(zip, "r");
  try { fs.readSync(fd, head, 0, 4, 0); } finally { fs.closeSync(fd); }
  assert.strictEqual(head.toString("latin1", 0, 2), "PK", "zip must start with the PK local-file signature");
  assert.strictEqual(head[2], 0x03);
  assert.strictEqual(head[3], 0x04);
}

test("the distribution zip exists and has a valid ZIP signature", () => {
  assertPkZip(path.join(ROOT, "dist", `feedhacker-${manifest.version}.zip`));
});

test("the Chrome Web Store zip exists and has manifest.json at its root (no wrapper folder)", () => {
  const zip = path.join(ROOT, "dist", `feedhacker-${manifest.version}-store.zip`);
  assertPkZip(zip);
  // Central-directory filenames must include a bare "manifest.json", not "feedhacker/manifest.json".
  const buf = fs.readFileSync(zip);
  const names = [];
  const re = Buffer.from("PK\x01\x02"); // central directory header signature
  for (let i = 0; (i = buf.indexOf(re, i)) !== -1; i += 4) {
    const nameLen = buf.readUInt16LE(i + 28);
    names.push(buf.toString("utf8", i + 46, i + 46 + nameLen));
  }
  assert.ok(names.includes("manifest.json"), `store zip must have manifest.json at root; saw: ${names.slice(0, 3).join(", ")}…`);
  assert.ok(!names.some((n) => n.startsWith("feedhacker/")), "store zip must not nest under a feedhacker/ folder");
});
