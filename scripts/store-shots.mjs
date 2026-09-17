// Regenerate the Chrome Web Store screenshots and the landing-page carousel from the BUILT
// extension, so listing graphics cannot drift from what the product actually does.
//
// They had drifted badly. Three images advertised Solo mode two releases after it was removed,
// one of those also showed version 0.4.7 and the extension id of a store item we no longer use,
// and a fourth showed a group row mixing "Promoted ×1, AI Slop ×2, Hiring ×1" — a shape FH-061
// made impossible. Nobody was careless: there was no generator, the 2026-08-21 set was captured
// by hand, and hand-made assets rot silently because nothing fails when they do.
//
//   npm run store:shots            # all of them
//   npm run store:shots -- popup   # just the specs whose name contains "popup"
//
// Every panel is a REAL screenshot of the built extension (popup, options page, or a live
// filtered feed in a real browser), composed into the brand layout at exactly 1280×800 — the
// size the store wants. Nothing here is drawn by hand.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_STORE = path.join(ROOT, "store");
const OUT_CAROUSEL = path.join(ROOT, "docs", "carousel");
const W = 1280, H = 800;                 // Chrome Web Store screenshot size
const SCALE = 2;                         // capture at 2x, emit at 1x for crisp text

function chromePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (!/^chromium-\d/.test(d)) continue;
    const bin = path.join(root, d, "chrome-linux", "chrome");
    if (fs.existsSync(bin)) return bin;
  }
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch { /* none */ }
  throw new Error("no Chromium found — run `npx playwright install chromium`");
}

// --- brand -------------------------------------------------------------------------------
// Taken from styles.css and the existing set rather than re-invented: LinkedIn blue for the
// emphasis span, near-black navy for headlines, the slop green and the reversible orange.
const BLUE = "#0a66c2", NAVY = "#0b1b33", INK = "#33425a";
const GREEN = "#1d7a3c", ORANGE = "#c4471c";

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    font:16px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background:linear-gradient(135deg,#eff2f7 0%,#e7ecf3 55%,#dfe6ef 100%);
    color:${NAVY};display:flex;align-items:center;
  }
  .left{width:560px;padding:0 0 0 96px;flex:none}
  .lockup{display:flex;align-items:center;gap:14px;margin-bottom:38px}
  .lockup img{width:46px;height:46px;border-radius:11px;display:block}
  .lockup b{font-size:23px;letter-spacing:-.2px}
  h1{font-size:60px;line-height:1.04;letter-spacing:-1.6px;font-weight:800;margin-bottom:26px}
  h1 em{font-style:normal;color:var(--accent,${BLUE})}
  p.sub{font-size:19px;line-height:1.5;color:${INK};margin-bottom:34px;max-width:470px}
  ul{list-style:none;display:flex;flex-direction:column;gap:17px}
  li{display:flex;align-items:center;gap:14px;font-size:17px;color:${NAVY}}
  li i{
    flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent,${BLUE});color:#fff;
    font-style:normal;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center
  }
  .right{flex:1;display:flex;align-items:center;justify-content:center;padding:0 60px 0 20px}
  .shot{
    background:#fff;border-radius:16px;overflow:hidden;
    box-shadow:0 26px 60px rgba(11,27,51,.16),0 3px 10px rgba(11,27,51,.07);
  }
  .shot img{display:block;width:100%;height:auto}
`;

// PNG IHDR — the raw capture's pixel size, so the card can be fitted to the frame instead of
// guessed at. A card sized by width alone overflowed 800px tall and got cropped top and bottom.
function pngSize(file) {
  const b = fs.readFileSync(file).subarray(16, 24);
  return { w: b.readUInt32BE(0), h: b.readUInt32BE(4) };
}
// Largest width that keeps the whole capture inside `box`, allowing for the 2x capture scale.
function fitWidth(file, box) {
  const { w, h } = pngSize(file);
  return Math.round(Math.min(box.w, (box.h * w) / h));
}

// Images are embedded as data URIs, not file:// URLs. The composition is loaded with
// setContent, so the page origin is about:blank and Chromium will not fetch file:// from it —
// both the icon and the screenshot came back as broken-image placeholders the first time.
const dataUri = (p) => `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;

function page({ headline, accent, sub, bullets, shot, box }) {
  const shotWidth = fitWidth(shot, box);
  const icon = dataUri(path.join(ROOT, "icons", "128.png"));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
  <body style="--accent:${accent}">
    <div class="left">
      <div class="lockup"><img src="${icon}" alt=""><b>FeedHacker</b></div>
      <h1>${headline}</h1>
      <p class="sub">${sub}</p>
      <ul>${bullets.map((b) => `<li><i>${b.badge}</i>${b.text}</li>`).join("")}</ul>
    </div>
    <div class="right"><div class="shot" style="width:${shotWidth}px"><img src="${dataUri(shot)}"></div></div>
  </body></html>`;
}

// --- capture helpers ---------------------------------------------------------------------
async function shot(ctx, url, { width, height, clip, clipTo, settle = 900, prep }) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height });
  await p.goto(url, { waitUntil: "load" });
  if (prep) await prep(p);
  await p.waitForTimeout(settle);          // let the async settings read paint (FH-058's lesson)
  // Clip to the real content height unless the caller asked for a specific crop: a viewport-
  // sized capture of a short page trails dead white space inside the card.
  // clipTo: end the capture at the bottom of a named element, so a page of collapsed panels
  // does not trail a stack of empty headers with the last one sliced in half.
  if (!clip && clipTo) {
    const h = await p.evaluate((sel) => {
      const el = [...document.querySelectorAll("details.panel")]
        .find((d) => d.querySelector("h2") && d.querySelector("h2").textContent.trim() === sel);
      return el ? Math.ceil(el.getBoundingClientRect().bottom + 12) : 0;
    }, clipTo);
    if (h > 80) clip = { x: 0, y: 0, width, height: Math.min(h, height) };
  }
  if (!clip) {
    // scrollHeight is not the content height here: popup.html and options.html both stretch to
    // the viewport, so it just echoes `height` and the card ends up with a slab of dead white
    // space. Measure the furthest bottom edge of any laid-out element instead.
    const h = await p.evaluate(() => {
      let bottom = 0;
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
      });
      return Math.ceil(bottom + 10);            // a hair of breathing room under the last row
    });
    clip = { x: 0, y: 0, width, height: Math.max(80, Math.min(h, height)) };
  }
  const file = path.join(TMP, `raw-${Math.random().toString(36).slice(2)}.png`);
  await p.screenshot({ path: file, clip });
  await p.close();
  return file;
}

const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "fh-shots-"));

// Load the STORE package, not dist/feedhacker. They are different builds: the unpacked tree is
// the sideload one, which build.mjs gives a fixed manifest `key` and the nativeMessaging
// permission (for the Windows updater). Screenshotting that put "Permissions: storage,
// nativeMessaging" in a store listing image, directly contradicting the "only permission:
// storage" claim beside it — and advertising a permission the store build does not request.
// Unzipping the real upload artifact is the only way the image can be true of what users get.
function storePackage(version) {
  const zip = path.join(ROOT, "dist", `feedhacker-${version}-store.zip`);
  if (!fs.existsSync(zip)) throw new Error(`${path.relative(ROOT, zip)} not found — run \`npm run build\` first`);
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "fh-store-pkg-"));
  execFileSync("unzip", ["-q", zip, "-d", dir]);
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (m.key || (m.permissions || []).includes("nativeMessaging")) {
    throw new Error("the store zip carries a key or nativeMessaging — that should be sideload-only");
  }
  return dir;
}

async function main() {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
  const EXT = storePackage(version);
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const profile = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "fh-shot-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath: chromePath(), deviceScaleFactor: SCALE,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-sandbox"],
  });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  console.log(`built extension ${version}, id ${extId}`);

  // Settings chosen to make each panel show something worth showing, written before any page
  // reads them.
  const seed = (s) => sw.evaluate((v) => new Promise((r) => chrome.storage.sync.set(v, r)), s);

  const specs = [];

  // 1 + 2 — the toolbar popup. A few kinds on, so the toggles read as controls in use.
  await seed({ muteSloppy: true, mutePromoted: true, muteHiring: true, groupHiddenRuns: true,
               nameNames: true, nameSample: true, slopTargetFrac: 0.28 });
  const popup = await shot(ctx, `chrome-extension://${extId}/popup.html`, { width: 360, height: 900 });
  specs.push({
    name: "popup-store", out: path.join(OUT_STORE, "screenshot-1-mixer.png"),
    headline: `Mute the<br>noise in <em>your</em><br>LinkedIn feed`, accent: BLUE,
    sub: `One toggle per kind of noise — AI slop, promoted, company, hiring and more — right from the toolbar.`,
    bullets: [{ badge: "1", text: "Turn a post type off to hide it" },
              { badge: "2", text: "AI slop has its own sensitivity slider" },
              { badge: "3", text: "Nothing is deleted — every post reopens" }],
    shot: popup, box: { w: 430, h: 690 },
  });
  specs.push({
    name: "popup-carousel", out: path.join(OUT_CAROUSEL, "carousel-2-mixer.png"),
    headline: `You choose what<br>gets <em>through</em>`, accent: BLUE,
    sub: `Nine kinds of feed noise, one toggle each, right from the toolbar — plus a learned AI-slop model with its own slider.`,
    bullets: [{ badge: "1", text: "Turn a post type off to hide it" },
              { badge: "2", text: "Sensitivity tunes AI-slop strictness" },
              { badge: "3", text: "Settings sync across your browsers" }],
    shot: popup, box: { w: 430, h: 690 },
  });

  // 5 — the options page's own account of itself: version, permissions, and what the controls do.
  const optionsShot = await shot(ctx, `chrome-extension://${extId}/options.html`, {
    width: 760, height: 1100, clipTo: "Actions",
    prep: async (p) => {
      await p.evaluate(() => {
        document.querySelectorAll("details.panel").forEach((d) => (d.open = false));
        ["Status", "Properties", "Actions"].forEach((want) => {
          document.querySelectorAll("details.panel").forEach((d) => {
            const h = d.querySelector("h2");
            if (h && h.textContent.trim() === want) d.open = true;
          });
        });
        // The Extension ID of an unpacked load is a throwaway dev id — it is not the id users
        // install, and the real one does not exist until the package is uploaded. Showing a
        // wrong id is worse than showing none, so the row comes out of the shot.
        // The Properties table is a <dl>, so the row is a dt/dd PAIR — a generic
        // "remove the element whose text starts with Extension ID" pass matched nothing.
        document.querySelectorAll("#props dt").forEach((dt) => {
          if ((dt.textContent || "").trim() === "Extension ID") {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === "DD") dd.remove();
            dt.remove();
          }
        });
      });
    },
  });
  specs.push({
    name: "transparent-carousel", out: path.join(OUT_CAROUSEL, "carousel-5-transparent.png"),
    headline: `Transparent and<br><em>on-device</em>`, accent: BLUE,
    sub: `The status page shows exactly what is running: the version, the one permission, the single site it touches, and what each control does.`,
    bullets: [{ badge: "✓", text: "Only permission: storage" },
              { badge: "✓", text: "Runs on www.linkedin.com only" },
              { badge: "✓", text: "Scoring & learning stay in your browser" }],
    shot: optionsShot, box: { w: 560, h: 660 },
  });

  // 3 — a live, filtered feed. Served at the real origin so the content script fires, then
  // screenshotted: the group row in this image is one FeedHacker actually produced.
  const feedShot = await feedCapture(ctx);
  specs.push({
    name: "group-carousel", out: path.join(OUT_CAROUSEL, "carousel-3-group.png"),
    headline: `A run of noise<br>folds into <em>one<br>line</em>`, accent: GREEN,
    sub: `Back-to-back posts hidden for the SAME reason collapse into a single summary row — so your feed gets shorter, not busier.`,
    bullets: [{ badge: "✓", text: "One row per reason, never mixed" },
              { badge: "✓", text: "Show all restores the run in place" },
              { badge: "✓", text: "Nothing is ever deleted" }],
    shot: feedShot, box: { w: 560, h: 700 },
  });

  let made = 0;
  for (const s of specs) {
    if (only.length && !only.some((o) => s.name.includes(o))) continue;
    const p = await ctx.newPage();
    await p.setViewportSize({ width: W, height: H });
    await p.setContent(page(s), { waitUntil: "load" });
    await p.waitForTimeout(350);
    fs.mkdirSync(path.dirname(s.out), { recursive: true });
    await p.screenshot({ path: s.out, clip: { x: 0, y: 0, width: W, height: H }, scale: "css" });
    await p.close();
    console.log(`  ${path.relative(ROOT, s.out)}  ${W}x${H}`);
    made++;
  }
  await ctx.close();
  if (!only.length) bundle();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`${made} image(s) regenerated at ${W}x${H}.`);
}

// A fixture feed at the real LinkedIn origin, so the packaged content script runs on it and the
// stub/group row below is genuine output rather than a mock-up of one.
async function feedCapture(ctx) {
  const SLOP = [
    "Let’s be honest: this isn’t just a job — it’s a calling. The result? Growth, clarity, and momentum. Here’s what nobody tells you: it’s not about titles. It’s about impact. 🚀 Dream big. 💡 Work hard. 🔥 Stay humble.",
    "Here’s the thing: this isn’t just a meeting — it’s a movement. The takeaway? Focus, courage, and clarity. Here’s why nobody tells you: it’s not about headcount. It’s about culture. 🚀 Think bigger. 💡 Move faster. 🔥 Stay curious.",
    "Let’s be honest: this isn’t just a product — it’s a promise. The best part? Trust, speed, and delight. Here’s what nobody tells you: it’s not about features. It’s about outcomes. 🚀 Ship often. 💡 Listen harder. 🔥 Stay humble.",
  ];
  const human = (name, role, when, body) => `
    <div class="post"><h2>Feed post</h2>
      <div class="hdr"><span class="av">${name.split(" ").map((w) => w[0]).join("")}</span>
        <div><b>${name}</b><small>${role} · ${when}</small></div></div>
      <p>${body}</p>
      <div class="acts"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
    </div>`;
  const slopPost = (i, name, role) => `
    <div class="post"><h2>Feed post</h2>
      <div class="hdr"><span class="av">${name.split(" ").map((w) => w[0]).join("")}</span>
        <div><b>${name}</b><small>${role} · ${2 + i}h</small></div></div>
      <p>${SLOP[i]}</p>
      <div class="acts"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
    </div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font:14px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,Arial,sans-serif;background:#f4f2ee;color:#1d2226;padding:14px}
    #feed{width:512px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
    .post{background:#fff;border:1px solid #e3e5e8;border-radius:10px;padding:12px 14px}
    .post h2{position:absolute;left:-9999px;font-size:1px}
    .hdr{display:flex;gap:9px;align-items:center;margin-bottom:8px}
    .av{width:34px;height:34px;border-radius:50%;background:#0a66c2;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex:none}
    .hdr b{display:block;font-size:14px}
    .hdr small{color:#5f6b7a;font-size:12px}
    .post p{font-size:13.5px;color:#1d2226}
    .acts{display:flex;gap:18px;margin-top:9px;padding-top:7px;border-top:1px solid #eef0f2;color:#5f6b7a;font-weight:600;font-size:12.5px}
  </style></head><body><main><div id="feed">
    ${human("Priya Nair", "Staff Engineer at Lattice Systems", "3h", "Spent the morning chasing a cache-invalidation bug that only showed up under load. Two services disagreed about TTL units — seconds vs ms. The fix was one line; finding it was four hours. Wrote it up for the team wiki so the next person gets the four hours back.")}
    ${slopPost(0, "Growth Guru", "Founder · Thought Leader")}
    ${slopPost(1, "Cami Czarny", "Chief Vision Officer")}
    ${slopPost(2, "Luca Bonmassar", "Head of Momentum")}
    ${human("Diego Alvarez", "Design Lead at Fieldnote", "8h", "We rewrote onboarding after watching 12 user sessions. Biggest lesson: people don’t read empty states, they read buttons. Dropping the tour and putting the first action front and center doubled completion.")}
  </div></main></body></html>`;

  await ctx.route("https://www.linkedin.com/feed/", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 560, height: 1000 });
  await p.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".feedhacker-stub.feedhacker-group", { timeout: 25000 });
  await p.waitForTimeout(700);
  const clip = await p.evaluate(() => {
    const r = document.getElementById("feed").getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: Math.min(r.height + 16, 760) };
  });
  const file = path.join(TMP, "raw-feed.png");
  await p.screenshot({ path: file, clip });
  await p.close();
  return file;
}

// Everything the Developer Dashboard asks for, in one folder, numbered in upload order — so a
// release is "drop these in" rather than "work out which of ten files in two directories are
// current". The store carousel takes up to FIVE screenshots at 1280x800 and the listing only
// ever supplied three; all five here are verified-current 1280x800 images.
function bundle() {
  const dir = path.join(ROOT, "dist", "store-upload");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;

  // Screenshot order tells a story: what it does, the control, the tidy-up, the reversibility,
  // then the trust panel.
  const screenshots = [
    ["docs/carousel/carousel-1-feed.png", "screenshot-1-feed.png"],
    ["store/screenshot-1-mixer.png", "screenshot-2-popup.png"],
    ["docs/carousel/carousel-3-group.png", "screenshot-3-grouping.png"],
    ["store/screenshot-3-stub.png", "screenshot-4-stub.png"],
    ["docs/carousel/carousel-5-transparent.png", "screenshot-5-transparent.png"],
  ];
  const others = [
    ["store/promo-small-440x280.png", "promo-small-440x280.png"],
    ["store/promo-marquee-1400x560.png", "promo-marquee-1400x560.png"],
    ["store/brand/store-icon-128.png", "store-icon-128.png"],
    [`dist/feedhacker-${version}-store.zip`, `feedhacker-${version}-store.zip`],
    ["dist/store-description.txt", "store-description.txt"],
  ];
  const copied = [];
  for (const [from, to] of [...screenshots, ...others]) {
    const src = path.join(ROOT, from);
    if (!fs.existsSync(src)) { console.log(`  ! missing, skipped: ${from}`); continue; }
    fs.copyFileSync(src, path.join(dir, to));
    copied.push(to);
  }
  const png = (f) => {
    const { w, h } = pngSize(path.join(dir, f));
    return `${w}x${h}`;
  };
  fs.writeFileSync(path.join(dir, "UPLOAD.txt"),
`FeedHacker ${version} — Chrome Web Store upload bundle
Generated by \`npm run store:shots\`. Every image is a screenshot of THIS build.

PACKAGE  (Dashboard -> your item -> Package -> Upload new package)
  feedhacker-${version}-store.zip

SCREENSHOTS  (Store listing -> Screenshots; up to 5, ${screenshots.length} supplied, all ${png(screenshots[0][1])})
${screenshots.map(([, to], i) => `  ${i + 1}. ${to}   ${png(to)}`).join("\n")}

PROMO TILES  (Store listing -> Promo images; both optional but recommended)
  promo-small-440x280.png     ${png("promo-small-440x280.png")}   (small tile)
  promo-marquee-1400x560.png  ${png("promo-marquee-1400x560.png")}  (marquee)

ICON  (Store listing -> Store icon)
  store-icon-128.png          ${png("store-icon-128.png")}

DESCRIPTION  (Store listing -> Description)
  store-description.txt — paste the whole file. It ends with a WHAT'S NEW block
  for the last three versions, which is the only way per-version notes can reach
  users: the store has no separate release-notes field.

Sizes are what the store requires: screenshots 1280x800, small tile 440x280,
marquee 1400x560, icon 128x128.
`);
  console.log(`bundle: dist/store-upload/ (${copied.length} files + UPLOAD.txt)`);
}

main().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
