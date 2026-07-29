"use strict";
// Guard the brand generation of every shipped icon.
//
// Bug this locks: the Chrome Web Store listing showed the new "Fh" mark while installed
// copies still showed the previous MAX "M" mark. The listing icon and the icon Chrome
// paints for an install come from two different places — the Dashboard's listing assets
// vs. `manifest.icons` inside the uploaded package — so they can drift apart silently.
// Anchoring both to one brand constant means a half-done rebrand fails here instead of
// shipping a listing that doesn't match what users see in their toolbar.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
// BRAND_BLUE / MIN_BRAND_SHARE come from test/png.js so this tier and the system tier
// measure against ONE constant — two copies could drift and let the store listing and the
// packaged icons disagree again (best_practices §33).
const { decodePng, colorShare, BRAND_BLUE, MIN_BRAND_SHARE } = require("../png");

const ROOT = path.join(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
// Palette of the superseded MAX "M" mark. Any real coverage of these means an old-brand
// asset is still in the tree.
const SUPERSEDED = {
  "M-mark teal": [0x35, 0xc6, 0xee],
  "M-mark slate": [0x2e, 0x3a, 0x5a],
  "M-mark navy": [0x4a, 0x5c, 0x82],
};

// Icons that are a solid brand-blue tile: the four packaged sizes plus the store-listing
// icons.
const BLUE_TILES = [
  ...Object.values(manifest.icons),
  "store/brand/store-icon-128.png",
  "store/brand/store-icon-120.png",
  "store/brand/logo-1024.png",
  "feedhacker-logo.png",
];
// Every brand raster, including ones that are mostly white (the lockup). These only have
// to be free of the old palette.
const ALL_BRAND_RASTERS = [...BLUE_TILES, "store/brand/logo-lockup-1024.png"];

function read(rel) {
  const p = path.join(ROOT, rel);
  assert.ok(fs.existsSync(p), `missing brand asset ${rel}`);
  return decodePng(fs.readFileSync(p));
}

test("the brand constant still matches the source-of-truth mark (icons/icon.svg)", () => {
  const hex = "#" + BRAND_BLUE.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
  for (const svg of ["icons/icon.svg", "icons/icon-small.svg", "store/brand/logo.svg"]) {
    const src = fs.readFileSync(path.join(ROOT, svg), "utf8");
    assert.ok(
      src.toUpperCase().includes(hex),
      `${svg} no longer fills with ${hex} — update BRAND_BLUE here in the same change as the artwork`
    );
  }
});

test("every packaged icon and the store-listing icon are the same brand blue", () => {
  // The store icon must be opaque (the store rejects transparency) and the toolbar icons
  // have transparent corners, so this compares opaque pixels only — see test/png.js.
  for (const rel of BLUE_TILES) {
    const share = colorShare(read(rel), BRAND_BLUE);
    assert.ok(
      share >= MIN_BRAND_SHARE,
      `${rel} is only ${(share * 100).toFixed(1)}% brand blue (need >=${MIN_BRAND_SHARE * 100}%) — ` +
        `looks like a stale pre-rebrand asset. The store listing and installed copies must show the same mark.`
    );
  }
});

test("no brand raster still carries the superseded M-mark palette", () => {
  for (const rel of ALL_BRAND_RASTERS) {
    const img = read(rel);
    for (const [name, rgb] of Object.entries(SUPERSEDED)) {
      const share = colorShare(img, rgb);
      assert.ok(
        share <= 0.02,
        `${rel} is ${(share * 100).toFixed(1)}% ${name} — that's the old brand, not the current Fh mark`
      );
    }
  }
});

test("the packaged icon set is exactly the sizes the manifest declares", () => {
  // A leftover icon file in icons/ is a candidate for the wrong manual store upload, which
  // is how the listing and the package got out of step in the first place.
  const declared = new Set(Object.values(manifest.icons).map((p) => path.basename(p)));
  const present = fs.readdirSync(path.join(ROOT, "icons")).filter((f) => f.endsWith(".png"));
  assert.deepStrictEqual(
    present.sort(),
    [...declared].sort(),
    "icons/ holds PNGs the manifest doesn't declare (or is missing one)"
  );
});

test("no loose image files sit at the repo root", () => {
  // Brand assets live in icons/ (packaged) and store/ (listing). Root-level copies named
  // like upload targets — storeicon128.png, "Store image.jpg" — are how an old-brand file
  // gets picked by hand in the Dashboard. feedhacker-logo.* is the one sanctioned exception.
  const ALLOWED = new Set(["feedhacker-logo.png", "feedhacker-logo.svg"]);
  const stray = fs
    .readdirSync(ROOT)
    .filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f) && !ALLOWED.has(f));
  assert.deepStrictEqual(
    stray,
    [],
    `move these under icons/ or store/ (or delete them): ${stray.join(", ")}`
  );
});
