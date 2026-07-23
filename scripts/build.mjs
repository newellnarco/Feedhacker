// Package FeedHacker into an installable, unpacked-or-zipped Chrome extension.
// Cross-platform Node build (no bash, no external `zip` binary) so `npm run build`
// works identically on Windows, macOS, and Linux. Compiles the TypeScript sources
// (src/ -> build/), then assembles only the runtime files into dist/feedhacker/ and
// dist/feedhacker-<version>.zip. Load unpacked from dist/feedhacker/, or drag the zip
// onto chrome://extensions.
import { execFileSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

// Compiled JS (from build/) that ships in the extension.
const JS_FILES = [
  "background.js", "inject.js", "banlist.js", "filters.js", "logger.js", "selectors.js", "matcher.js",
  "scorer.js", "sloplog.js", "authors.js", "customfilters.js", "feed.js", "content.js", "popup.js", "options.js", "update.js",
];
// Static assets that ship as-is from the repo root.
const STATIC_FILES = ["manifest.json", "popup.html", "options.html", "welcome.html", "styles.css", "claudisms.json"];

// Sideload builds (the plain zip the self-updater downloads, and the Windows bundle) get
// a fixed `key` so the unpacked extension ID is stable — native messaging must whitelist
// an exact ID — plus the `nativeMessaging` permission so the options page's "Update now"
// can drive the local update helper. This public key hashes to the unpacked ID
// `fefpmbcbklcplgfohobiekbndohmfcpi`, which installer/windows/install.ps1 registers as
// the native host's allowed origin. The Chrome Web Store package omits both (store
// installs auto-update; it keeps the listing's permissions minimal).
const SIDELOAD_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoAzHWqci7gZ86QXnY485kCGxv9DY6TBSn07wS9DFM5x2Plop4QqjfvMiFIJP6pJS1077CAAxHVnrSf639JmdfbBAyJvb9czLFO2Qcz5dwUIIvk//ZgNJjPpAD3CvNG1IIGU1ZJVfu11E8P51KhQIldjz11TC8IGECyA2clfSo3j/pyzgpssKapVXCm2gjjRzAQ3TZh4jJAl6UYs3DywpJfsVkUpG+lisardeKUIPmrm5FU58evIQwGJZ4+/DiASpWThELhyVeTpY9S5/NbM0J0KfkutCnxB7uYYX0ELcLHSiLCjjUdM617JqVgeyNxY6vYLka9pWT5Tlio7f9D5nfQIDAQAB";

function patchManifestForSideload(manifestPath) {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  m.key = SIDELOAD_KEY;
  m.permissions = m.permissions || [];
  if (!m.permissions.includes("nativeMessaging")) m.permissions.push("nativeMessaging");
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");
}

const OUT = "dist";
const STAGE = path.join(OUT, "feedhacker");
const WIN_STAGE = path.join(OUT, "feedhacker-win");

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// --- minimal, dependency-free ZIP writer (deflate) -----------------------------
// Node ships no archive-creation API; hand-rolling the container keeps the build
// dependency-free and identical on every OS. Uses a fixed DOS timestamp so builds
// are reproducible.
const DOS_TIME = 0, DOS_DATE = 0x21; // 1980-01-01 00:00:00

// CRC-32 (IEEE). Implemented here rather than via node:zlib.crc32 so the build runs
// on any Node LTS (zlib.crc32 only landed in Node 20.15 / 22.2).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// `prefix` nests every entry under a top-level folder (e.g. "feedhacker/manifest.json")
// so unzipping yields the folder name the Load-unpacked docs tell users to select.
function zipDir(srcDir, zipPath, prefix = "") {
  const files = [];
  (function walk(dir, rel) {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (fs.statSync(abs).isDirectory()) walk(abs, relPath);
      else files.push({ abs, name: relPath });
    }
  })(srcDir, prefix);

  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    const crc = crc32(data) >>> 0;
    const compressed = deflateRawSync(data);
    const nameBuf = Buffer.from(f.name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(8, 8);             // method: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);            // extra len
    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);               // version made by
    cd.writeUInt16LE(20, 6);               // version needed
    cd.writeUInt16LE(0, 8);                // flags
    cd.writeUInt16LE(8, 10);               // method
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);               // extra len
    cd.writeUInt16LE(0, 32);               // comment len
    cd.writeUInt16LE(0, 34);               // disk number
    cd.writeUInt16LE(0, 36);               // internal attrs
    cd.writeUInt32LE(0, 38);               // external attrs
    cd.writeUInt32LE(offset, 42);          // local header offset
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);                 // disk
  end.writeUInt16LE(0, 6);                 // cd start disk
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);           // cd offset
  end.writeUInt16LE(0, 20);                // comment len

  fs.writeFileSync(zipPath, Buffer.concat([...chunks, centralBuf, end]));
}

// --- build ---------------------------------------------------------------------
console.log("Compiling TypeScript…");
execFileSync(process.execPath, [path.join("node_modules", "typescript", "bin", "tsc")], { stdio: "inherit" });

// Generate build/banlist.js from claudisms.json so the banlist ships bundled into the
// content scripts (content.js reads self.FeedHackerBanlist) instead of being fetched from
// a web-accessible resource. This keeps claudisms.json out of web_accessible_resources and
// off linkedin.com's page-visible Resource Timing — one fewer extension-origin reference a
// site could enumerate. JSON.parse validates the source before we emit it as JS.
const banlist = JSON.parse(fs.readFileSync("claudisms.json", "utf8"));
fs.writeFileSync(path.join("build", "banlist.js"), "self.FeedHackerBanlist=" + JSON.stringify(banlist) + ";\n");

const version = JSON.parse(fs.readFileSync("manifest.json", "utf8")).version;
const zipPath = path.join(OUT, `feedhacker-${version}.zip`);
const winZip = path.join(OUT, `feedhacker-${version}-win.zip`);
const storeZip = path.join(OUT, `feedhacker-${version}-store.zip`);

rmrf(STAGE); rmrf(zipPath);
fs.mkdirSync(STAGE, { recursive: true });

for (const f of JS_FILES) {
  const src = path.join("build", f);
  if (!fs.existsSync(src)) { console.error(`ERROR: missing compiled file: ${src}`); process.exit(1); }
  copyFile(src, path.join(STAGE, f));
}
for (const f of STATIC_FILES) {
  if (!fs.existsSync(f)) { console.error(`ERROR: missing static file: ${f}`); process.exit(1); }
  copyFile(f, path.join(STAGE, f));
}
fs.cpSync("icons", path.join(STAGE, "icons"), { recursive: true });

// Chrome Web Store upload package FIRST, from the CLEAN manifest (no key, no
// nativeMessaging) — store installs auto-update and the listing stays minimal. manifest.json
// sits at the ZIP ROOT (no wrapping folder), which the Developer Dashboard requires.
rmrf(storeZip);
zipDir(STAGE, storeZip);

// Everything below is a SIDELOAD build. Bake in the fixed key + nativeMessaging so the
// unpacked ID is stable and "Update now" can reach the local update helper. The plain
// feedhacker-<version>.zip is what the self-updater re-downloads, so it must carry these
// too — otherwise a self-update would swap in the store-clean manifest and change the ID.
patchManifestForSideload(path.join(STAGE, "manifest.json"));
zipDir(STAGE, zipPath, "feedhacker"); // unzips to a feedhacker/ folder (Load unpacked)

// --- Windows one-click bundle: extension + installer scripts + docs ---
rmrf(WIN_STAGE); rmrf(winZip);
fs.mkdirSync(WIN_STAGE, { recursive: true });
fs.cpSync(STAGE, path.join(WIN_STAGE, "feedhacker"), { recursive: true });
fs.cpSync(path.join("installer", "windows"), path.join(WIN_STAGE, "installer"), { recursive: true });
if (fs.existsSync("INSTALL.md")) copyFile("INSTALL.md", path.join(WIN_STAGE, "INSTALL.md"));
fs.writeFileSync(path.join(WIN_STAGE, "START-HERE.txt"), `FeedHacker for Windows
======================
Double-click  installer\\install.bat  to install and set up auto-updates.
(No admin needed. It installs the prebuilt extension, sets up daily auto-updates
from GitHub, then guides a one-time "Load unpacked".)

Other scripts:
  installer\\update.bat     - pull the latest green build from GitHub now
  installer\\uninstall.bat  - remove the auto-update task (add nothing to keep files)

Prefer manual install? Open chrome://extensions, enable Developer mode,
click "Load unpacked", and pick the  feedhacker  folder in this archive.
See INSTALL.md for details.
`);
zipDir(WIN_STAGE, winZip);

// --- Chrome Web Store LISTING ASSETS bundle: listing/privacy docs + all graphics.
// Deliberately contains NO manifest.json and NOT the extension package — the extension
// `-store.zip` is uploaded separately as the package; this is just the listing material.
const SUB_STAGE = path.join(OUT, "feedhacker-store-submission");
const subZip = path.join(OUT, `feedhacker-${version}-store-submission.zip`);
rmrf(SUB_STAGE); rmrf(subZip);
fs.mkdirSync(SUB_STAGE, { recursive: true });
const SUBMISSION_ASSETS = [
  ["store/listing.md", "listing.md"],
  ["store/privacy-policy.md", "privacy-policy.md"],
  ["store/promo-small-440x280.jpg", "promo-small-440x280.jpg"],
  ["store/promo-marquee-1400x560.jpg", "promo-marquee-1400x560.jpg"],
  ["store/screenshot-1-mixer.png", "screenshot-1-mixer.png"],
  ["store/screenshot-2-detection.png", "screenshot-2-detection.png"],
  ["store/screenshot-3-stub.png", "screenshot-3-stub.png"],
  ["store/brand/store-icon-128.png", "store-icon-128.png"],
  ["store/brand/store-icon-120.png", "store-icon-120.png"],
  ["store/brand/logo-1024.png", "logo-1024.png"],
  ["store/brand/logo-lockup-1024.png", "logo-lockup-1024.png"],
];
for (const [src, dest] of SUBMISSION_ASSETS) if (fs.existsSync(src)) copyFile(src, path.join(SUB_STAGE, dest));
fs.writeFileSync(path.join(SUB_STAGE, "README.txt"), `FeedHacker — Chrome Web Store listing assets
=============================================
These are the LISTING materials only. This archive contains no manifest.json and is NOT
the extension package. Upload the extension package separately:

  Package to upload:  feedhacker-${version}-store.zip  (built alongside this; manifest at root)

Then, in the Developer Dashboard, use the files here:
  listing.md                   - name, description, permission justifications
  privacy-policy.md            - privacy policy (host it and paste the URL)
  promo-small-440x280.jpg      - Small promo tile
  promo-marquee-1400x560.jpg   - Marquee promo tile
  screenshot-1-mixer.png       - Screenshot: Mute/Solo mixer (1280x800)
  screenshot-2-detection.png   - Screenshot: AI-slop detection panel (1280x800)
  screenshot-3-stub.png        - Screenshot: hidden-post stub (1280x800)
  store-icon-128.png           - 128x128 store icon (Fh mark, transparent corners)
  store-icon-120.png           - 120x120 store icon (Fh mark, transparent corners)
  logo-1024.png                - brand logo (square Fh mark)
  logo-lockup-1024.png         - brand lockup: Fh mark + FeedHacker wordmark + credit line
`);
zipDir(SUB_STAGE, subZip);

console.log("Built:");
console.log(`  unpacked:  ${STAGE}/   (Load unpacked)`);
console.log(`  zip:       ${zipPath}`);
console.log(`  store:     ${storeZip}   (Chrome Web Store upload)`);
console.log(`  submission:${subZip}   (listing assets: docs + graphics, no manifest)`);
console.log(`  windows:   ${winZip}   (extension + installer)`);
