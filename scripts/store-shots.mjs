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
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
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

// --- MAX Research Collective brand --------------------------------------------------------
// Sampled from store/brand/MRC.jpg (the publisher mark) rather than eyeballed, and matched
// against maxresearchcollective.com: a dark navy field with a faint circuit/node motif, an
// angular M in slate with cyan and coral facets, and an all-caps tracked wordmark where MAX is
// white and RESEARCH COLLECTIVE is cyan.
const MRC = {
  navyFrom: "#222d3f", navyTo: "#1a2031",   // the mark's own diagonal, top-left -> bottom-right
  cyan: "#6be1ef",
  coral: "#fb635e",
  slate: "#303e59",
  muted: "#8fa3bd",
};
// FeedHacker's own identity, unchanged from store/brand/logo-lockup.svg — the blue included.
const FH_BLUE = "#0A66C2";
const FH_INK = "#0b1b33";
const FH_CARD = "#ffffff";

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

  if (!only.length || only.some((o) => "promo".includes(o) || o === "promo")) await promoTiles(ctx);

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
    // JPEG for the tiles: store/README points uploads at the .jpg, and both are generated.
    ["store/promo-small-440x280.jpg", "promo-small-440x280.jpg"],
    ["store/promo-marquee-1400x560.jpg", "promo-marquee-1400x560.jpg"],
    ["store/promo-small-440x280.png", "promo-small-440x280.png"],
    ["store/promo-marquee-1400x560.png", "promo-marquee-1400x560.png"],
    ["store/brand/store-icon-128.png", "store-icon-128.png"],
    [`dist/feedhacker-${version}-store.zip`, `feedhacker-${version}-store.zip`],
    ["dist/store-description.txt", "store-description.txt"],
    ["store/privacy-policy.md", "privacy-policy.md"],
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
  fs.writeFileSync(path.join(dir, "SUBMISSION.md"), submissionSheet(version, dir, screenshots));
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
  // One archive to download, so "export and load into the dashboard" is a single file.
  const zipOut = path.join(ROOT, "dist", `feedhacker-${version}-submission.zip`);
  fs.rmSync(zipOut, { force: true });
  execFileSync("zip", ["-qr", zipOut, "."], { cwd: dir });
  console.log(`bundle: dist/store-upload/ (${copied.length} files + SUBMISSION.md + UPLOAD.txt)`);
  console.log(`        dist/${path.basename(zipOut)}  (${(fs.statSync(zipOut).size / 1048576).toFixed(1)} MB)`);
}

// Every field the Developer Dashboard asks for, filled in from the repo's own sources, so a
// submission is transcription rather than recall. Pulled from store/listing.md (summary, single
// purpose, permission justifications, privacy disclosures) and manifest.json (version, the
// permission actually declared) — not retyped here, so it cannot drift from what ships.
function submissionSheet(version, dir, screenshots) {
  const listing = read("store/listing.md");
  const section = (heading) => {
    const m = listing.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`));
    return m ? m[1].trim() : `(not found in store/listing.md: ${heading})`;
  };
  const summary = (listing.match(/\*\*Summary\*\*[^:]*:\s*(.+)/) || [, "(not found)"])[1].trim();
  const manifest = JSON.parse(read("manifest.json"));
  const png = (f) => { const { w, h } = pngSize(path.join(dir, f)); return `${w}×${h}`; };

  return `# FeedHacker ${version} — Chrome Web Store submission sheet

Generated by \`npm run store:shots\`. Every value below comes from the repo
(\`store/listing.md\`, \`manifest.json\`, \`store/release-notes.md\`), so it matches what is
actually in the package rather than what anyone remembered.

Work top to bottom in the dashboard. Fields are in the order the UI presents them.

---

## 1. Package

**Upload:** \`feedhacker-${version}-store.zip\`

Declared permission: **${(manifest.permissions || []).join(", ")}** — nothing else. Host access is
limited to the \`www.linkedin.com\` content script. No \`optional_host_permissions\`, no remote
code, no network requests (the AI-slop phrase list ships inside the package). There is no
\`update_url\` — the store manages updates.

## 2. Store listing

| Field | Value |
|---|---|
| **Name** | FeedHacker |
| **Summary** | ${summary} |
| **Category** | Productivity |
| **Language** | English |

**Description** — paste the whole of \`store-description.txt\`. It ends with a WHAT'S NEW block
for the last three versions; the store has no separate release-notes field, so that block is the
only way per-version notes reach users.

## 3. Graphics

| Field | File | Size |
|---|---|---|
| **Store icon** | \`store-icon-128.png\` | ${png("store-icon-128.png")} |
${screenshots.map(([, to], i) => `| **Screenshot ${i + 1}** | \`${to}\` | ${png(to)} |`).join("\n")}
| **Small promo tile** | \`promo-small-440x280.jpg\` | 440×280 |
| **Marquee promo tile** | \`promo-marquee-1400x560.jpg\` | 1400×560 |

All are opaque (no alpha), which the store requires. The store icon is deliberately on a solid
white background — a transparent-corner icon is rejected in that field, even though the
in-package toolbar icon correctly keeps its transparency.

## 4. Privacy practices

**Single purpose**

${section("Single purpose")}

**Permission justifications**

${section("Permission justifications")}

**Data usage disclosures**

${section("Data usage disclosures \\(Privacy practices tab\\)")}

The policy's full text is included here as \`privacy-policy.md\` for reference. **Save the draft
after filling this tab** — the publish check reads the saved value, not the one on screen.

## 5. Distribution

Public. Unofficial and not affiliated with LinkedIn — keep that note in the description and do
not use LinkedIn's logo.

---

## Before you hit Submit

- The version must be **higher than the live one**. ${version} > 0.9.0 (live), so this is fine.
- The store takes **one pending version at a time**. 0.9.0 has already cleared review, so the
  slot is free; after submitting ${version} it is occupied until Google decides.
- \`Publish successful\`/\`Submitted\` means **submitted for review, not approved**. Confirm from
  the listing page, never the inbox: https://chromewebstore.google.com/detail/feedhacker/kccajfoghkplakndamlohpepopdpelkb
- Review has taken ~14 min, ~30 min, overnight and ~30 min for the last four versions. Slow is
  not rejected.
`;
}

// The faint circuit/node traces behind the MRC mark. Drawn, not traced from the JPEG, so the
// tiles stay crisp at any size — same vocabulary (thin diagonals, small nodes, a few right
// angles), same two accent colours, same very low opacity.
function circuitry(w, h) {
  const line = (x1, y1, x2, y2, c, o, sw = 1) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${c}" stroke-opacity="${o}" stroke-width="${sw}" fill="none"/>`;
  const node = (x, y, r, c, o) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity="${o}"/>`;
  const elbow = (x, y, dx, dy, c, o) =>
    `<path d="M${x} ${y} h${dx} v${dy}" stroke="${c}" stroke-opacity="${o}" stroke-width="1" fill="none"/>`;
  const p = [];
  for (let i = 0; i < 7; i++) {                       // long diagonals, the mark's dominant motion
    const off = i * (w / 6);
    p.push(line(off - h, h, off, 0, i % 3 ? MRC.cyan : MRC.coral, i % 3 ? 0.07 : 0.05));
  }
  p.push(elbow(w * 0.68, h * 0.18, w * 0.13, h * 0.2, MRC.cyan, 0.12));
  p.push(elbow(w * 0.06, h * 0.72, w * 0.1, -h * 0.18, MRC.cyan, 0.1));
  p.push(elbow(w * 0.8, h * 0.66, -w * 0.09, h * 0.16, MRC.coral, 0.08));
  const seed = [[0.72, 0.2], [0.81, 0.38], [0.1, 0.72], [0.16, 0.55], [0.9, 0.3], [0.62, 0.84], [0.35, 0.12]];
  seed.forEach(([fx, fy], i) =>
    p.push(node(w * fx, h * fy, i % 2 ? 3 : 4.5, i % 3 === 2 ? MRC.coral : MRC.cyan, i % 2 ? 0.5 : 0.32)));
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">${p.join("")}</svg>`;
}

// FeedHacker's element tile, exactly as store/brand/logo-lockup.svg draws it — same blue, same
// 38% inner stroke, same 42 / Fh / caption. Nothing about the mark changes on the dark field.
function fhTile(size) {
  const s = size / 128;
  return `<svg width="${size}" height="${size}" viewBox="0 0 128 128" style="display:block;flex:none">
    <rect width="128" height="128" rx="16" fill="${FH_BLUE}"/>
    <rect x="5.5" y="5.5" width="117" height="117" rx="11.5" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2.5"/>
    <text x="15" y="33" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#fff">42</text>
    <g fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
      <path d="M39 40 V86"/><path d="M39 45 H60"/><path d="M39 61 H55"/>
      <path d="M70 34 V86"/><path d="M70 62 C70 51 90 51 90 66 V86"/>
    </g>
    <text x="64" y="110" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13"
          font-weight="600" letter-spacing=".3" fill="#fff">FeedHacker</text>
  </svg>`.replace("<svg", `<svg data-scale="${s}"`);
}

// The publisher lockup, in MRC's own typography: all caps, wide tracking, MAX white and
// RESEARCH COLLECTIVE cyan, over a short coral rule.
function mrcLockup({ wordSize, domainSize, ruleWidth, align = "flex-start" }) {
  return `<div style="display:flex;flex-direction:column;align-items:${align};gap:${Math.round(wordSize * 0.55)}px">
    <div style="width:${ruleWidth}px;height:3px;background:${MRC.coral};border-radius:2px"></div>
    <div style="font-size:${wordSize}px;font-weight:800;letter-spacing:.2em;line-height:1;white-space:nowrap">
      <span style="color:#fff">MAX</span> <span style="color:${MRC.cyan}">RESEARCH COLLECTIVE</span>
    </div>
    <div style="font-size:${domainSize}px;color:${MRC.muted};letter-spacing:.06em">maxresearchcollective.com</div>
  </div>`;
}

function tileHtml({ w, h, variant }) {
  const bg = `background:linear-gradient(135deg,${MRC.navyFrom} 0%,${MRC.navyTo} 100%)`;
  // Single quotes: this string goes into a DOUBLE-quoted style attribute, and "Segoe UI" in
  // double quotes silently terminated the attribute — every tile rendered in the default serif.
  const font = `font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif`;

  // The FeedHacker lockup, in its own colours on its own light card — blue on white, exactly as
  // store/brand/logo-lockup.svg designs it. An earlier pass reversed the wordmark to white so it
  // would read on the dark field; the instruction is to keep the blue, so the card carries it
  // instead. It also matches how the 1280x800 screenshots already present the product: a white
  // card with a soft shadow floating on a coloured ground.
  const card = ({ tile, name, tag, pad, radius, gap }) => `
    <div style="background:${FH_CARD};border-radius:${radius}px;padding:${pad};display:flex;
                align-items:center;gap:${gap}px;
                box-shadow:0 24px 60px rgba(4,10,22,.45),0 2px 6px rgba(4,10,22,.3)">
      ${fhTile(tile)}
      <div style="display:flex;flex-direction:column;gap:${Math.round(name * 0.17)}px;min-width:0">
        <div style="font-size:${name}px;font-weight:800;letter-spacing:${(-name * 0.027).toFixed(1)}px;
                    color:${FH_BLUE};line-height:1;white-space:nowrap">FeedHacker</div>
        <div style="font-size:${tag}px;font-weight:600;color:${FH_INK};letter-spacing:-.2px;white-space:nowrap">
          Mute the noise in <span style="color:${FH_BLUE}">your LinkedIn feed</span></div>
      </div>
    </div>`;

  if (variant === "marquee") {
    return `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;${bg};${font}">
      ${circuitry(w, h)}
      <div style="position:relative;height:100%;display:flex;align-items:center;padding:0 62px;gap:44px">
        ${card({ tile: 132, name: 66, tag: 23, pad: "40px 52px", radius: 22, gap: 34 })}
        <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;text-align:right">
          ${mrcLockup({ wordSize: 17, domainSize: 14, ruleWidth: 48, align: "flex-end" })}
        </div>
      </div>
    </body></html>`;
  }
  // 440x280: the card carries FeedHacker, the publisher signs it underneath on the dark field.
  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;${bg};${font}">
    ${circuitry(w, h)}
    <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;
                justify-content:center;gap:22px;padding:0 26px">
      ${card({ tile: 60, name: 31, tag: 12.5, pad: "20px 26px", radius: 14, gap: 17 })}
      <div style="display:flex;justify-content:center">
        ${mrcLockup({ wordSize: 11, domainSize: 10, ruleWidth: 32, align: "center" })}
      </div>
    </div>
  </body></html>`;
}

// The two Chrome Web Store promo tiles. Sizes are fixed by the store: 1400x560 marquee,
// 440x280 small. Written as PNG and JPEG because store/README points uploads at the .jpg.
async function promoTiles(ctx) {
  const specs = [
    { variant: "marquee", w: 1400, h: 560, base: "promo-marquee-1400x560" },
    { variant: "small", w: 440, h: 280, base: "promo-small-440x280" },
  ];
  for (const t of specs) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: t.w, height: t.h });
    await p.setContent(tileHtml(t), { waitUntil: "load" });
    await p.waitForTimeout(250);
    const clip = { x: 0, y: 0, width: t.w, height: t.h };
    await p.screenshot({ path: path.join(OUT_STORE, `${t.base}.png`), clip, scale: "css" });
    await p.screenshot({ path: path.join(OUT_STORE, `${t.base}.jpg`), clip, scale: "css", type: "jpeg", quality: 92 });
    await p.close();
    console.log(`  store/${t.base}.png + .jpg  ${t.w}x${t.h}`);
  }
}

main().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
