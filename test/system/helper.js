"use strict";
// System-test harness: launch real (headless) Chromium with the *built* unpacked
// extension loaded, serve a fixture that looks like LinkedIn's feed at the real
// linkedin.com origin (so the manifest's content-script matches fire), and drive it.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist", "feedhacker");

// Resolve the FULL Chromium binary. Returning an explicit executablePath is critical:
// MV3 extensions need a service worker, which `chrome-headless-shell` (what Playwright
// picks for headless:true when executablePath is undefined) cannot host. Point at the
// full chromium so the extension actually loads. In sandboxes without Playwright's own
// download, fall back to any pre-installed browser. Returns { ok, executablePath }.
function resolveChrome() {
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return { ok: true, executablePath: p };
  } catch { /* not installed */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (!/^chromium-\d/.test(d)) continue;
    const bin = path.join(root, d, "chrome-linux", "chrome");
    if (fs.existsSync(bin)) return { ok: true, executablePath: bin };
  }
  return { ok: false };
}

function extensionBuilt() {
  return fs.existsSync(path.join(EXT, "manifest.json"));
}

// Launch the extension and open a page whose URL is the real feed but whose body is
// `fixtureHtml`. `sync` seeds chrome.storage.sync before the content script reads it.
async function launchFeed({ fixtureHtml, sync }) {
  const { executablePath } = resolveChrome();
  const args = [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--no-sandbox",
  ];
  // Explicit per-run profile dir (in the OS temp dir) so each launch is hermetic and
  // leaves nothing behind — removed best-effort on close.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "feedhacker-pw-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, { headless: true, executablePath, args });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  if (sync) {
    await sw.evaluate((s) => new Promise((r) => chrome.storage.sync.set(s, r)), sync);
  }
  await ctx.route("https://www.linkedin.com/feed/", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: fixtureHtml })
  );
  const page = await ctx.newPage();
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
  const close = async () => {
    await ctx.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  };
  return { ctx, page, close };
}

module.exports = { resolveChrome, extensionBuilt, launchFeed, EXT, ROOT };
